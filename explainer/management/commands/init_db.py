from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from pathlib import Path

from mappers.db_connection import apply_schema


class Command(BaseCommand):
    help = 'Apply schema.sql to PostgreSQL (raw SQL, no Django ORM).'

    def handle(self, *args, **options):
        schema_path = Path(settings.BASE_DIR) / 'schema.sql'
        if not schema_path.exists():
            raise CommandError(f'Schema file not found at {schema_path}. Ensure private schema.sql is present.')
        apply_schema(schema_path)
        self.stdout.write(self.style.SUCCESS(f'Applied {schema_path}'))
