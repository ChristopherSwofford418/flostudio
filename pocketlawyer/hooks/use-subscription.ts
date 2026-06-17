/**
 * useSubscription — Native Apple StoreKit in-app subscription hook
 *
 * Product IDs (must match App Store Connect exactly):
 *   io.pocketlawyer.app.monthly  — $9.99/month
 *   io.pocketlawyer.app.annual   — $79.99/year
 *
 * Web uses hooks/use-subscription.web.ts (platform file split).
 */

import {
  connectAsync,
  disconnectAsync,
  finishTransactionAsync,
  getProductsAsync,
  getPurchaseHistoryAsync,
  IAPResponseCode,
  InAppPurchaseState,
  purchaseItemAsync,
  setPurchaseListener,
} from "expo-in-app-purchases";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSubscription, setSubscription } from "@/lib/legal-store";

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
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = useRef(false);

  const connect = useCallback(async () => {
    try {
      if (!connected.current) {
        await connectAsync();
        connected.current = true;
      }

      setPurchaseListener(async ({ responseCode, results, errorCode }: any) => {
        if (responseCode === IAPResponseCode.OK && results) {
          for (const purchase of results) {
            if (
              purchase.acknowledged === false &&
              (purchase.purchaseState === InAppPurchaseState.PURCHASED ||
                purchase.purchaseState === undefined)
            ) {
              await finishTransactionAsync(purchase, false);
              const newPlan: SubscriptionPlan =
                purchase.productId === PRODUCT_ANNUAL ? "annual" : "monthly";
              await setSubscription({ isPro: true, plan: newPlan });
              setIsPro(true);
              setPlan(newPlan);
            }
          }
        } else if (responseCode !== IAPResponseCode.USER_CANCELED) {
          setError(`Purchase failed (code ${errorCode ?? responseCode})`);
        }
        setPurchasing(false);
      });

      const { responseCode, results } = await getProductsAsync([
        PRODUCT_MONTHLY,
        PRODUCT_ANNUAL,
      ]);
      if (responseCode === IAPResponseCode.OK && results) {
        const sorted = [...results].sort((a: any, _b: any) =>
          a.productId === PRODUCT_MONTHLY ? -1 : 1
        );
        setProducts(
          sorted.map((item: any) => ({
            productId: item.productId,
            title: item.title,
            description: item.description,
            price: item.price,
          }))
        );
      }

      const sub = await getSubscription();
      setIsPro(sub.isPro);
      setPlan(sub.plan as SubscriptionPlan);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already connected")) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (connected.current) {
        disconnectAsync().catch(() => {});
        connected.current = false;
      }
    };
  }, [connect]);

  const purchase = useCallback(async (productId: string) => {
    setError(null);
    setPurchasing(true);
    try {
      await purchaseItemAsync(productId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancelled") && !msg.includes("cancel")) {
        setError(msg);
      }
      setPurchasing(false);
    }
  }, []);

  const purchaseMonthly = useCallback(() => purchase(PRODUCT_MONTHLY), [purchase]);
  const purchaseAnnual = useCallback(() => purchase(PRODUCT_ANNUAL), [purchase]);

  const restorePurchases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { responseCode, results } = await getPurchaseHistoryAsync();
      if (responseCode === IAPResponseCode.OK && results && results.length > 0) {
        const subPurchase = results.find(
          (p: any) => p.productId === PRODUCT_MONTHLY || p.productId === PRODUCT_ANNUAL
        );
        if (subPurchase) {
          const restoredPlan: SubscriptionPlan =
            subPurchase.productId === PRODUCT_ANNUAL ? "annual" : "monthly";
          await setSubscription({ isPro: true, plan: restoredPlan });
          setIsPro(true);
          setPlan(restoredPlan);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const sub = await getSubscription();
    setIsPro(sub.isPro);
    setPlan(sub.plan as SubscriptionPlan);
  }, []);

  return {
    isPro,
    plan,
    products,
    loading,
    purchasing,
    error,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    refresh,
  };
}
