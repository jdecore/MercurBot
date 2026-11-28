# RetainBot — Telecom Retention AI MVP

**Live Demo:** [https://retain-bot.vercel.app/](https://retain-bot.vercel.app/)  
**Program:** GCI World 2026 September — Matsuo-Iwasawa Lab, The University of Tokyo  
**Author:** Juan Diego Enriquez Ramos (Colombia)

## Overview
**RetainBot** is the delivery MVP for the *Company A* Telecom Churn Final Assignment (`5-Fold CV Ensemble: 0.7000 ROC-AUC, 74.40% Precision@20%, 1.50x Lift`). It turns model predictions (`top20_risk_customers.csv`) into actionable, opt-in retention outreach (*Omotenashi* + *Poka-Yoke*).

## Features
- **3-Step Guided Flow:**
  1. **Data:** Load real Company A Top-20% risk predictions or upload any scored `.csv`.
  2. **Risk Queue + Poka-Yoke:** Inspect `Customer_ID`, churn probability, and `eqpdays`.
  3. **Multi-Channel Opt-in Outreach:** Dispatch pre-filled opt-in offers via **WhatsApp**, **Telegram**, or **LINE**, or assign to the **A/B Control Group**.
- **Trilingual UI:** Instant switching between **English (EN)**, **Spanish (ES)**, and **Japanese (日本語)**.
- **4-Month Kaizen Roadmap & Risks:** Built-in implementation plan (`3.7%` break-even) and risk mitigations.

## Tech Stack
- React 19 + TypeScript + Vite
- Deployed on Vercel

## Local Development
```bash
pnpm install
pnpm dev
pnpm build
```
