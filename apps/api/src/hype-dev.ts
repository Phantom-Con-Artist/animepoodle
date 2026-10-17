// Node-only adapter. The deployed Pages Function never imports this module.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HypeBindings, HypeDatabase, HypeStatement } from './hype';

export function sqliteHypeDatabase(db: DatabaseSync): HypeDatabase {
  class Statement implements HypeStatement {
    values: SQLInputValue[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) {
      const statement = new Statement(this.sql);
      statement.values = values as SQLInputValue[];
      return statement;
    }
    async first<T>() {
      return (db.prepare(this.sql).get(...this.values) as T) || null;
    }
    async all<T>() {
      return { results: db.prepare(this.sql).all(...this.values) as T[] };
    }
    async run() {
      return db.prepare(this.sql).run(...this.values);
    }
  }
  return {
    prepare: (sql) => new Statement(sql),
    async batch<T>(statements: HypeStatement[]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((value) => {
          const statement = value as Statement;
          const prepared = db.prepare(statement.sql);
          if (prepared.columns().length) return { results: prepared.all(...statement.values) };
          prepared.run(...statement.values);
          return { results: [] };
        });
        db.exec('COMMIT');
        return results as T[];
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
export function localHypeBindings(): HypeBindings {
  const directory = new URL('../../../.wrangler/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(fileURLToPath(new URL('hype.sqlite', directory)));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(readFileSync(new URL('../../../migrations/0001_hype.sql', import.meta.url), 'utf8'));
  return {
    HYPE_DB: sqliteHypeDatabase(db),
    HYPE_LOCAL_DEV: 'true',
    HYPE_HASH_SECRET: 'local-development-only-not-a-production-secret',
  };
}
