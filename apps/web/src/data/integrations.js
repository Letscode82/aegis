import { C } from "@aegis/ui";

export const INTEGRATIONS={
  "Contracts":{systems:["SAP Ariba","DocuSign CLM","iManage DMS","Salesforce CRM","Coupa Procurement","OFAC Screening","Refinitiv World-Check"],status:"6/7 Connected",health:"98.2%"},
  "Regulatory":{systems:["Thomson Reuters Regulatory Intelligence","LexisNexis","EU AI Act Registry","SEC EDGAR","India MCA Portal","China CAC Portal"],status:"5/6 Connected",health:"96.8%"},
  "Litigation":{systems:["Relativity eDiscovery","iManage DMS","Lex Machina Analytics","PACER","Courts Online","Legal Tracker"],status:"6/6 Connected",health:"99.1%"},
  "Compliance":{systems:["Refinitiv World-Check","OFAC SDN List","Navex EthicsPoint","CrowdStrike Falcon","SAP ERP","ServiceNow GRC"],status:"6/6 Connected",health:"99.5%"},
  "Legal Spend":{systems:["Legal Tracker (TyMetrix)","SAP Concur","Workday Finance","e-Billing Hub","CounselLink"],status:"5/5 Connected",health:"99.8%"},
  "Governance":{systems:["Diligent Boards","Workday HCM","Companies House API","SEC EDGAR","Entity Management System"],status:"4/5 Connected",health:"97.2%"},
  "Investigation":{systems:["Relativity eDiscovery","Nuix","CrowdStrike Falcon","Exchange Online","Slack Enterprise Grid","Endpoint DLP"],status:"6/6 Connected",health:"99.3%"},
  "Case Management":{systems:["Relativity","iManage","Microsoft 365 Compliance Center","Slack Enterprise","ServiceNow Legal","Workday HCM","SAP ERP"],status:"6/7 Connected",health:"98.6%"},
};

export const ARCH_LAYERS=[
{name:"Presentation Layer",color:C.bl,items:["Mission Control Dashboard (React)","Mobile GC App (React Native)","Board Reporting Portal","API Gateway (Kong)"]},
{name:"Agent Orchestration",color:C.tl,items:["n8n Workflow Engine","Protocol Engine (CASE_PROTOCOL.md pattern)","Agent Memory Store (CASE_MEMORY.md pattern)","Human-in-Loop Escalation Router"]},
{name:"AI / Intelligence Layer",color:C.pp,items:["Claude Sonnet 4.6 (Primary LLM)","GPT-4o (Fallback)","Custom Legal NER Models","Predictive Litigation Model","Risk Scoring Engine"]},
{name:"Knowledge Graph",color:C.am,items:["Neo4j Graph Database","Pinecone Vector Store","Entity Resolution Engine","Relationship Inference Engine","Temporal Graph Versioning"]},
{name:"Data Integration",color:C.or,items:["MCP Protocol Connectors","REST/GraphQL APIs","SFTP Batch Ingestion","Real-time Webhooks","ETL Pipeline (Airflow)"]},
{name:"Security & Compliance",color:C.rd,items:["SOC 2 Type II","ISO 27001","Privilege-Aware Architecture","End-to-End Encryption (AES-256)","RBAC + Attribute-Based Access","Audit Trail (Immutable Log)"]},
{name:"Infrastructure",color:C.t3,items:["AWS GovCloud / Azure Sovereign","Kubernetes (EKS)","PostgreSQL + TimescaleDB","Redis Cache Layer","Prometheus + Grafana Monitoring"]},
];
