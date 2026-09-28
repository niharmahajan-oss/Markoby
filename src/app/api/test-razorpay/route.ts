import { NextResponse } from "next/server";
import { ensureCustomer, createSubscription } from "@/lib/billing/razorpay";

export async function GET() {
  try {
    const customer = await ensureCustomer("test-user-id", "test@example.com", "Test User");
    const sub = await createSubscription(customer.id);
    return NextResponse.json({ ok: true, customer, sub });
  } catch (err: any) {
    console.error("Razorpay Test Error:", err);
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 });
  }
}
