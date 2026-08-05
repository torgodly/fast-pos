# Fast POS — Cashier Print Agent (Windows)

Silent **direct** printing for USB receipt printers on the cashier PC.
No browser print dialog — sends raw ESC/POS to the Windows printer queue.

## Setup (once per cashier Windows PC)

1. Install the USB thermal printer in Windows (XPrinter driver).
2. Note the **exact printer name** in Settings → Printers (e.g. `XP-80C`).
3. Copy this folder to the cashier PC, e.g. `C:\fast-pos-print-agent\`
4. Copy `config.example.json` → `config.json` and set:

```json
{
  "port": 9288,
  "printerName": "XP-80C"
}
```

5. Double-click **`start.bat`** (or run `node server.mjs`).
6. In Fast POS admin → Printers:
   - Add checkout printer
   - Connection: **USB محلي**
   - Host field: same Windows printer name (`XP-80C`)
7. Link a cashier station to that printer.

## Auto-start with Windows

Use NSSM or Task Scheduler to run `start.bat` at login:

```powershell
# Example with NSSM
nssm install FastPOSPrintAgent "C:\Program Files\nodejs\node.exe" "C:\fast-pos-print-agent\server.mjs"
nssm set FastPOSPrintAgent AppDirectory C:\fast-pos-print-agent
nssm start FastPOSPrintAgent
```

## Test

With the agent running:

```powershell
curl http://127.0.0.1:9288/health
curl http://127.0.0.1:9288/printers
```

Pay a test order from the cashier browser on **this PC** — receipt prints silently.

## How it works

```
Cashier browser → Fast POS server (payment saved)
                → browser receives ESC/POS bytes
                → http://127.0.0.1:9288/print (this agent)
                → Windows RAW spooler → USB printer
```

Kitchen printers still print from the **server** over network IP.
