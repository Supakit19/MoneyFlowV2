# MoneyFlow Pocket: LINE Rich Menu

This release changes only the bottom-right cell of the **existing 3 x 2 Rich Menu**.

- First five cells keep their existing LINE chat commands: `สรุปวันนี้`, `สรุปสัปดาห์`, `กราฟเดือนนี้`, `งบคงเหลือ`, `สรุปเดือนนี้`.
- Bottom-right cell shows **สมุดเงิน** and opens `https://liff.line.me/2011955989-OUGIQOBk` via LINE's URI action.
- The bank notification connector, AI bot, five chat shortcuts, users, and database are not modified.
- Existing image assets and the previous default menu are retained for rollback.

## Preparation and verification

```bash
bun scripts/build-richmenu-pocket.ts
LINE_LIFF_ID=2011955989-OUGIQOBk node server/setup-richmenu-pocket.mjs
bun test tests/richmenu-pocket.test.ts
bun test
bun run build
```

Generated illustration source uses `scripts/moneyflow-richmenu-cute.webp`. Output for LINE:
`scripts/moneyflow-richmenu-pocket.jpg`, 2500 x 1686, less than 1 MB. The PNG preview is ignored by Git.

## Production rollout

1. Back up live default Rich Menu's JSON and image using the LINE API.
2. Push the exact release commit to GitHub and fast-forward `/opt/moneyflow` without overwriting `.env.production`.
3. Confirm `GET https://moneyflow.aionixth.com/api/mini/config` returns `enabled: true` and the expected LIFF ID.
4. Use existing Messaging API token from `.env.production` *on the VPS only*. Never echo or commit it.
5. Preview: `cd /opt/moneyflow && node server/setup-richmenu-pocket.mjs`.
6. Publish with concurrency guard: `node server/setup-richmenu-pocket.mjs --apply --expect-default=<PREVIOUS_DEFAULT_RICH_MENU_ID>`.
7. Verify `GET /v2/bot/user/all/richmenu` reports the newly created menu, and all six actions are correct.
8. Test on the actual LINE OA chat. If a user has a specifically assigned Rich Menu, it may override the default.

## Rollback

The previous default Rich Menu remains present. To restore, call
`POST https://api.line.me/v2/bot/user/all/richmenu/<PREVIOUS_DEFAULT_RICH_MENU_ID>`
with the Messaging API bearer token on the VPS. Verify with
`GET https://api.line.me/v2/bot/user/all/richmenu`.

Do not use `docker compose down`, delete Rich Menus, or reset the database to roll back this change.
