interface Env {
  APP_ENV: string;
  PUBLIC_APP_URL: string;
  DEFAULT_CURRENCY: string;
  DEMO_SHOP_ID: string;
  DEMO_SHOP_NAME: string;
  ADMIN_PIN?: string;
  ADMIN_SESSION_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_DEFAULT_MODEL?: string;
  MESSAGE_UNDERSTANDING_MODE?: "rules_first" | "rules_only" | "ai_first";
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string;
  WHATSAPP_GRAPH_API_VERSION?: string;
  DB: D1Database;
  FILES: R2Bucket;
  SESSIONS: KVNamespace;
  JOB_QUEUE: Queue;
}
