ALTER TABLE "Product" ADD COLUMN "metadata" JSONB;

UPDATE "ManagementAreaRecord"
SET "title" = 'Jurídico/Financeiro'
WHERE "slug" = 'juridico' AND "title" = 'Jurídico';
