// MalMap — mock telemetry derived from the CLAUDE.md sample ProcMon rows.
// Used in Step 2 to populate the graph before the CSV parser (Step 4) exists.
//
// Source rows:
//   explorer.exe(1432) Process Start -> invoice.exe
//   invoice.exe(4044)  Process Create -> cmd.exe
//   cmd.exe(5112)      RegSetValue    -> HKCU\...\Run\Malware
//   invoice.exe(4044)  CreateFile     -> C:\Windows\Temp\payload.exe
//   invoice.exe(4044)  TCP Connect    -> 192.168.1.50:443
//
// Node types (ProcDOT-style): process | file | registry | network
// Labels use the thread-centric style: "<name>\n(P-<pid>, T-<tid>)".
// severity: high | mid | low  (drives the threat ring color)

const MALMAP_MOCK = {
  nodes: [
    { id: "p-1432", label: "explorer.exe\n(P-1432, T-1500)", type: "process",  severity: "low"  },
    { id: "p-4044", label: "invoice.exe\n(P-4044, T-4045)",  type: "process",  severity: "high" },
    { id: "p-5112", label: "cmd.exe\n(P-5112, T-5113)",      type: "process",  severity: "mid"  },
    { id: "reg-run", label: "Run\\Malware",         type: "registry", severity: "high" },
    { id: "file-payload", label: "payload.exe",     type: "file",     severity: "high" },
    { id: "net-c2", label: "192.168.1.50:443",      type: "network",  severity: "high" },
  ],
  edges: [
    { from: "p-1432", to: "p-4044", label: "Process Start"  },
    { from: "p-4044", to: "p-5112", label: "Process Create" },
    { from: "p-5112", to: "reg-run", label: "RegSetValue"    },
    { from: "p-4044", to: "file-payload", label: "CreateFile" },
    { from: "p-4044", to: "net-c2", label: "TCP Connect"     },
  ],
};
