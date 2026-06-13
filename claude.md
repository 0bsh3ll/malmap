# MalMap Project Instructions

You are building "MalMap"—a web-based (HTML, CSS, JS) interactive process and malware behavior visualizer inspired by ProcDot and Microsoft Defender Blast Radius.

## CRITICAL STEP-BY-STEP PROTOCOL
1. NEVER "one-shot" implementations or dump massive blocks of code unprompted.
2. For every task given by the user, you must first enter [PLAN MODE]. Outline the exact file structures, logic modifications, and architectural decisions.
3. At the end of your plan, stop and wait for explicit approval.
4. Do NOT modify or create files until the user types "APPROVED".
5. Implement ONLY the agreed-upon micro-step.

## UI/UX Blueprint (Microsoft Defender Blast Radius)
- Theme: Deep slate/charcoal dashboard background (`#0d1117`).
- Graph Engine: Vis.js (Network module via CDN).
- Icons: Lucide or FontAwesome via CDN inside circular canvas nodes with outer halos/glows for threat alerts.
- Layout: Left side panel for filters/controls, right/center pane for the Vis.js canvas.

## REFERENCE DATA: PROCMON CSV STRUCTURE
When structuring mock data or writing the parser engine later, always use this exact schema reflecting native Sysinternals outputs:

Headers: 
"Time of Day","Process Name","PID","Operation","Path","Result","Detail"

Sample Mock Telemetry Data for development/testing:
"""
"12:00:01 PM","explorer.exe","1432","Process Start","C:\Users\Target\Downloads\invoice.exe","SUCCESS","PID: 4044"
"12:00:02 PM","invoice.exe","4044","Process Create","C:\Windows\System32\cmd.exe","SUCCESS","PID: 5112"
"12:00:03 PM","cmd.exe","5112","RegSetValue","HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Malware","SUCCESS","Type: REG_SZ, Length: 34, Data: C:\Windows\Temp\payload.exe"
"12:00:04 PM","invoice.exe","4044","CreateFile","C:\Windows\Temp\payload.exe","SUCCESS","Desired Access: Generic Write"
"12:00:05 PM","invoice.exe","4044","TCP Connect","192.168.1.50:443","SUCCESS","Length: 0"
"""

## Master Roadmap
- Step 1: Core Layout (HTML/CSS shell)
- Step 2: Vis.js Integration & Mock Data Graph (using the sample schema above)
- Step 3: Graph Controls & Filtering UI
- Step 4: Telemetry Parser Engine (ProcMon CSV parsing)
- Step 5: Wiring Parser to the Live Graph
