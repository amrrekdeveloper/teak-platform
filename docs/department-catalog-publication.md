# Department catalog: two-stage publication

Publish transfers schema, not development lookup rows. Creating an empty catalog
and an FK from populated employees in one release fails validation.

## First publication

- Keep `hr_departments` in the schema, but omit `employee_department_catalog`.
- Preserve `attendance_job_state` in development and the source schema so Publish
  does not delete the production reconciliation checkpoint.
- The application fills only missing **referenced** department codes, using
  production's own employees, with no employee updates. Existing catalog labels
  and deleted unused departments are preserved. No development catalog is copied.
- Do not recreate the catalog table or FK from startup code or a deploy hook.
- While the validated FK is absent, catalog creation/deletion, employee creation,
  and employee updates containing `department` return a clear 503 transition
  message. Reads and employee attendance remain available.
- Shared advisory locks around sensitive writes coordinate with the exclusive
  lock used for the development-only constraint transition.

## Second publication — only after the owner publishes the first

1. Use read-only production queries to confirm the table exists and this returns 0:

   ```sql
   SELECT count(*) AS missing_catalog_rows
   FROM public.employees e
   LEFT JOIN public.hr_departments d ON d.code=e.department
   WHERE d.code IS NULL;
   ```

2. Add the named `employee_department_catalog` foreign key from
   `employees.department` to `hr_departments.code` to `shared/schema.ts`.
   Use NO ACTION for delete/update; do not cascade employee changes.
3. Apply that constraint **only to development**, in a transaction taking
   `pg_advisory_xact_lock(51804)`. Do not execute DDL or DML against production.
4. Recompute the Publish diff. Confirm it adds the FK without dropping data.
5. Ask the owner to publish the second release. The app automatically re-enables
   the paused writes when the validated FK exists; no environment flag or
   startup DDL is needed.

Development verification:

```sh
NODE_ENV=development npx tsx scripts/check-department-catalog.ts
```

The verification uses only transaction-local temporary tables and rolls them back.
