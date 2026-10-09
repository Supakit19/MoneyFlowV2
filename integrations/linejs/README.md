NaN can be mistakenly booked as an expense by rule 3.
Compare the MoneyFlow ledger to the bank regularly and correct such records.

## LINE OA notifications

When the "แจ้งกลับ LINE OA" switch is enabled, the backend pushes a receipt
for each committed import to the linked LINE OA account. For alerts whose
amount/direction cannot be determined, it can send a warning without banking
details. This operates in the backend; no browser tab needs to stay open.

The API's database schema does not reset the LINE OA push preference on restart.

## Setup

1. Open http://127.0.0.1:5178/linejs on the same Mac.
2. Start the LINEJS Local Agent and pair LINE if needed.
3. Confirm the real bank sender MID, bank and MoneyFlow destination account.
4. Enable receiving and, optionally, LINE OA push; save the configuration.
5. Leave the Mac running and connected to the internet.

The Worker listens for PUSH events and checks the authorized bank chat for
new messages roughly every minute. Read-only historical diagnostics may
inspect earlier message formats, but the Worker does not retroactively
create finance entries for alerts that predate its current start time.

LINEJS is an unofficial LINE library and should not be treated as a bank
reconciliation guarantee. Never publish the LINE session or bridge token.
