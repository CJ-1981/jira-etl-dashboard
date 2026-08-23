/**
 * Unit tests for the zod validation schemas (src/lib/validation/schemas.ts).
 * Currently focused on StorageConfigSchema, which guards the storageConfig
 * values API routes hand to getDb().
 */
import { describe, it, expect } from 'vitest';
import { StorageConfigSchema } from '@/lib/validation/schemas';

describe('StorageConfigSchema', () => {
  describe('valid inputs', () => {
    it('accepts a raw SQLite connection URL string', () => {
      const res = StorageConfigSchema.safeParse('file:./db/custom.db');
      expect(res.success).toBe(true);
      if (res.success) expect(res.data).toBe('file:./db/custom.db');
    });

    it('accepts a raw PostgreSQL connection URL string', () => {
      const res = StorageConfigSchema.safeParse(
        'postgresql://user:pass@localhost:5432/mydb',
      );
      expect(res.success).toBe(true);
    });

    it('accepts the app-store sqlite shape (empty url is allowed)', () => {
      const res = StorageConfigSchema.safeParse({
        provider: 'sqlite',
        url: '',
        isCustom: false,
      });
      expect(res.success).toBe(true);
    });

    it('accepts a postgresql object config with url + directUrl + connectionId', () => {
      const res = StorageConfigSchema.safeParse({
        provider: 'postgresql',
        url: 'postgresql://user:pass@localhost:5432/mydb',
        directUrl: 'postgresql://user:pass@localhost:5432/mydb',
        isCustom: true,
        connectionId: 'conn-1',
      });
      expect(res.success).toBe(true);
    });

    it('accepts the connectionId-only ("primary") shape', () => {
      const res = StorageConfigSchema.safeParse({ connectionId: 'primary' });
      expect(res.success).toBe(true);
    });

    it('accepts postgres connection parts (host/username/port/database)', () => {
      const res = StorageConfigSchema.safeParse({
        provider: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'user',
        password: 'secret',
      });
      expect(res.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('rejects an empty string', () => {
      expect(StorageConfigSchema.safeParse('').success).toBe(false);
    });

    it('rejects non-string, non-object values', () => {
      expect(StorageConfigSchema.safeParse(123).success).toBe(false);
      expect(StorageConfigSchema.safeParse(null).success).toBe(false);
      expect(StorageConfigSchema.safeParse(['file:./db/x.db']).success).toBe(false);
      expect(StorageConfigSchema.safeParse(true).success).toBe(false);
    });

    it('rejects an unknown provider', () => {
      const res = StorageConfigSchema.safeParse({ provider: 'mongodb' });
      expect(res.success).toBe(false);
    });

    it('rejects wrong-typed fields', () => {
      expect(
        StorageConfigSchema.safeParse({ provider: 'sqlite', url: 42 }).success,
      ).toBe(false);
      expect(
        StorageConfigSchema.safeParse({ provider: 'postgresql', port: '5432' }).success,
      ).toBe(false);
      expect(
        StorageConfigSchema.safeParse({ provider: 'sqlite', isCustom: 'yes' }).success,
      ).toBe(false);
    });
  });
});
