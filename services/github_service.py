import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from django.conf import settings

GITHUB_API = 'https://api.github.com'


class GitHubServiceError(Exception):
    pass


def parse_repo_url(raw_url):
    value = (raw_url or '').strip()
    if not value:
        raise GitHubServiceError('Repository URL is required.')
    if value.count('/') == 1 and 'github.com' not in value:
        owner, name = value.split('/', 1)
        return owner.strip(), name.strip().removesuffix('.git')
    parsed = urlparse(value if '://' in value else f'https://{value}')
    parts = [p for p in parsed.path.split('/') if p]
    if len(parts) < 2:
        raise GitHubServiceError('Use a GitHub URL like https://github.com/owner/repo.')
    return parts[0], parts[1].removesuffix('.git')


def _headers():
    headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'github-repo-explainer',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    token = getattr(settings, 'GITHUB_TOKEN', '') or os.getenv('GITHUB_TOKEN', '')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _get(path):
    request = Request(f'{GITHUB_API}{path}', headers=_headers())
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='ignore')
        if exc.code == 404:
            raise GitHubServiceError('Repository not found or private. Ensure the repo is public or provide a GITHUB_TOKEN in .env.') from exc
        if exc.code == 403:
            if 'rate limit' in detail.lower():
                raise GitHubServiceError('GitHub API rate limit exceeded. Add a GITHUB_TOKEN in .env to get 5,000 requests/hour.') from exc
            raise GitHubServiceError('Access forbidden. This repository may be private or restricted.') from exc
        raise GitHubServiceError(f'GitHub API error {exc.code}: {detail[:300]}') from exc
    except URLError as exc:
        raise GitHubServiceError(f'Could not reach GitHub: {exc.reason}') from exc


def get_repository(owner, repo):
    return _get(f'/repos/{quote(owner)}/{quote(repo)}')


def get_branches(owner, repo):
    try:
        branches = _get(f'/repos/{quote(owner)}/{quote(repo)}/branches?per_page=30')
        return [b.get('name') for b in branches if isinstance(b, dict) and b.get('name')]
    except Exception:
        return []


def get_tree(owner, repo, branch):
    data = _get(f'/repos/{quote(owner)}/{quote(repo)}/git/trees/{quote(branch)}?recursive=1')
    return data.get('tree') or []


def get_file_content(owner, repo, path, ref):
    encoded_path = '/'.join(quote(part) for part in path.split('/') if part)
    payload = _get(f'/repos/{quote(owner)}/{quote(repo)}/contents/{encoded_path}?ref={quote(ref)}')
    if isinstance(payload, list):
        raise GitHubServiceError('Path points to a directory, not a file.')
    import base64

    encoding = payload.get('encoding')
    if encoding == 'base64':
        raw = base64.b64decode(payload.get('content') or '')
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            text = raw.decode('utf-8', errors='replace')
        return {
            'path': payload.get('path') or path,
            'content': text,
            'sha': payload.get('sha'),
            'html_url': payload.get('html_url'),
        }
    raise GitHubServiceError('Unsupported file encoding from GitHub.')


def get_issues(owner, repo, state='open', query='', page=1, per_page=15):
    data = _get(f'/repos/{quote(owner)}/{quote(repo)}/issues?state={quote(state)}&per_page={int(per_page)}&page={int(page)}')
    issues = [item for item in data if 'pull_request' not in item]
    needle = (query or '').strip().lower()
    if needle:
        issues = [
            item
            for item in issues
            if needle in (item.get('title') or '').lower()
            or needle in (item.get('body') or '').lower()
        ]
    return issues


def get_single_issue(owner, repo, number):
    return _get(f'/repos/{quote(owner)}/{quote(repo)}/issues/{int(number)}')


def nest_tree(entries):
    root = {'name': '', 'path': '', 'type': 'tree', 'children': {}}
    for entry in entries:
        path = entry.get('path') or ''
        if not path:
            continue
        cursor = root
        parts = path.split('/')
        for index, part in enumerate(parts):
            is_leaf = index == len(parts) - 1
            node_type = entry.get('type') if is_leaf else 'tree'
            children = cursor['children']
            if part not in children:
                children[part] = {
                    'name': part,
                    'path': '/'.join(parts[: index + 1]),
                    'type': node_type,
                    'children': {},
                }
            cursor = children[part]
    return _children_to_list(root['children'])


def _children_to_list(children):
    nodes = []
    for name in sorted(children, key=lambda value: (children[value]['type'] != 'tree', value.lower())):
        node = children[name]
        item = {
            'name': node['name'],
            'path': node['path'],
            'type': node['type'],
        }
        nested = _children_to_list(node['children'])
        if nested:
            item['children'] = nested
        nodes.append(item)
    return nodes


def get_readme_content(owner, repo, ref='main'):
    for candidate in ('README.md', 'readme.md', 'README.rst', 'README.txt', 'README'):
        try:
            return get_file_content(owner, repo, candidate, ref)
        except Exception:
            continue
    return None


def extract_repo_keys_and_setup(owner, repo, tree_entries, ref='main'):
    """Find .env.example / .env.sample / config files and README to discover required API keys and setup steps."""
    found_keys = []
    config_files = []
    readme_text = ""

    # Check for README
    readme_payload = get_readme_content(owner, repo, ref)
    if readme_payload:
        readme_text = readme_payload.get('content', '')

    # Search for sample env files in tree
    env_filenames = {
        '.env.example', '.env.sample', '.env.template', '.env.local.example',
        'env.example', 'example.env', 'sample.env', 'config.example.json'
    }
    
    for entry in tree_entries:
        path = entry.get('path', '')
        base_name = path.split('/')[-1]
        if base_name in env_filenames or base_name.endswith('.example') or base_name.endswith('.sample'):
            config_files.append(path)
            try:
                content_obj = get_file_content(owner, repo, path, ref)
                lines = content_obj.get('content', '').splitlines()
                for line in lines:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key_part = line.split('=', 1)[0].strip()
                        if key_part and key_part not in found_keys:
                            found_keys.append(key_part)
            except Exception:
                pass

    return {
        'api_keys': found_keys,
        'config_files': config_files,
        'has_readme': bool(readme_text),
        'readme_length': len(readme_text),
        'readme_excerpt': readme_text[:6000] if readme_text else '',
    }
