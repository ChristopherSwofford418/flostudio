/**
 * Web stub for useSubscription.
 * expo-in-app-purchases is native-only; this file is loaded on web instead.
 */

import { useCallback, useEffect, useState } from "react";
import { getSubscription } from "@/lib/legal-store";

export const PRODUCT_MONTHLY = "io.pocketlawyer.app.monthly";
export const PRODUCT_ANNUAL = "io.pocketlawyer.app.annual";

export type SubscriptionPlan = "free" | "monthly" | "annual";

export interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
}

export interface UseSubscriptionReturn {
  isPro: boolean;
  plan: SubscriptionPlan;
  products: SubscriptionProduct[];
  loading: boolean;
  purchasing: boolean;
  error: string | null;
  purchaseMonthly: () => Promise<void>;
  purchaseAnnual: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const [isPro, setIsPro] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPlan>("free");

  useEffect(() => {
    getSubscription().then((sub) => {
      setIsPro(sub.isPro);
      setPlan(sub.plan as SubscriptionPlan);
    });
  }, []);

  const noop = useCallback(async () => {}, []);

  return {
    isPro,
    plan,
    products: [
      {
        productId: PRODUCT_MONTHLY,
        title: "Monthly",
        description: "Unlimited access, billed monthly",
        price: "$9.99",
      },
      {
        productId: PRODUCT_ANNUAL,
        title: "Annual",
        description: "Unlimited access, billed annually",
        price: "$79.99",
      },
    ],
    loading: false,
    purchasing: false,
    error: null,
    purchaseMonthly: noop,
    purchaseAnnual: noop,
    restorePurchases: noop,
    refresh: noop,
  };
}
