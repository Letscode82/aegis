export const WORKFLOWS_BUILT=[
{name:"NDA Auto-Draft & Send",status:"Active",triggers:"Intake request type = NDA",steps:8,executions:142,avgTime:"4 min",created:"2026-01-15",createdBy:"Legal Ops",
 nodes:["Intake Trigger","AI Classify NDA Type","Select Template","Auto-Fill Parties","AI Risk Check","Route (Standard→Send / Custom→Review)","DocuSign Send","Close Request"]},
{name:"Contract Renewal Reminder",status:"Active",triggers:"90 days before expiry",steps:5,executions:3211,avgTime:"Auto",created:"2025-11-01",createdBy:"Legal Ops",
 nodes:["Expiry Date Trigger","Pull Contract Data","AI Assess Renewal Risk","Notify Owner + Legal","Create Review Task"]},
{name:"Legal Hold Initiation",status:"Active",triggers:"New litigation / investigation filed",steps:10,executions:34,avgTime:"18 min",created:"2025-10-01",createdBy:"eDiscovery Team",
 nodes:["Case Trigger","Identify Custodians (AI)","Map IT Systems","Generate Hold Notice","Send Notices","Track Acknowledgments","Initiate IT Preservation","Sync M365 Compliance","Create Collection Schedule","GC Confirmation"]},
{name:"Invoice AI Review",status:"Active",triggers:"New LEDES invoice received",steps:7,executions:890,avgTime:"12 min",created:"2026-02-01",createdBy:"Legal Ops",
 nodes:["Invoice Received","Parse LEDES","AI Rate Check","AI Task Code Audit","Flag Block-Billed Entries","Generate Approval/Reject","Route to Legal Ops"]},
{name:"Regulatory Change Alert",status:"Active",triggers:"New regulation detected by AI agent",steps:6,executions:42,avgTime:"2 hrs",created:"2025-12-01",createdBy:"Regulatory Team",
 nodes:["AI Detection","Jurisdiction Match","Impact Assessment","Affected Systems Map","Generate Action Items","Assign Owners"]},
{name:"Cyber Breach Playbook",status:"Active",triggers:"CrowdStrike critical alert",steps:12,executions:1,avgTime:"—",created:"2026-01-20",createdBy:"GC + CISO",
 nodes:["Alert Trigger","Auto Legal Hold","CISO + GC Notify","Containment Verification","Forensics Engagement","Regulatory Deadline Calculator","Notification Drafts (per jurisdiction)","Board Alert","Insurance Claim Init","Customer Notification Decision","Remediation Plan","Post-Mortem"]},
];
