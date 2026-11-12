# OFFERME development instructions

- This project lives in `C:\Users\eyoba\Documents\WEB PROJECTS\Offerup`. Work directly in this directory. Do not create or stage OFFERME files in portmaker or another project.
- Keep independent `backend`, `website`, and `app` projects. Do not add shared source folders or cross-project source imports.
- Follow `OFFERUP_ETHIOPIA_IMPLEMENTATION_PLAN.md`. Product: OFFERME; launch: Addis Ababa; all general secondhand categories; website, Android, and iOS; Amharic, Afaan Oromo, and English.
- Transactions use local meetups and direct buyer-to-seller payment after inspection. Do not add riders, delivery, escrow, or platform purchase-payment processing.
- Before changing Next.js code, read the relevant installed guide in `website/node_modules/next/dist/docs/`. Follow its actual APIs and deprecations.
- On Windows use `npm.cmd` if PowerShell blocks npm.ps1. Keep each project's dependencies and lockfile separate.
- Update the implementation plan's status when a milestone is actually verified. Distinguish code written from code built, tested, and running.