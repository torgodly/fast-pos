"use client";

import { useRouter } from "next/navigation";
import { CustomerSelect } from "@/components/CustomerSelect";
import { setOrderCustomer } from "@/app/actions/orders";
import type { CustomerOption } from "@/app/actions/customers";

export function OrderCustomerSelect({
  orderId,
  customers,
  value,
}: {
  orderId: number;
  customers: CustomerOption[];
  value: number | null;
}) {
  const router = useRouter();

  return (
    <CustomerSelect
      customers={customers}
      value={value}
      onSelect={async (customerId) => {
        const result = await setOrderCustomer(orderId, customerId);
        if ("ok" in result) router.refresh();
        return result;
      }}
    />
  );
}
