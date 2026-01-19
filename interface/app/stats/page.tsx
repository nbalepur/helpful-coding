"use client";

import { Suspense } from "react";
import PageScaffold from "../components/PageScaffold";
import StatsPage from "../pages/StatsPage";
import LoadingSpinner from "../components/LoadingSpinner";

export default function StatsRoute() {
  return (
    <PageScaffold showBackground widerMaxWidth reducedPadding>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[calc(100vh-3rem)]">
            <LoadingSpinner size="lg" color="white" />
          </div>
        }
      >
        <StatsPage />
      </Suspense>
    </PageScaffold>
  );
}
