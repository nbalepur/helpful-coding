import { Suspense } from "react";
import PageScaffold from "../components/layout/PageScaffold";
import AboutPage from "../components/pages/AboutPage";
import LoadingSpinner from "../components/ui/LoadingSpinner";

// Disable static prerender to avoid CSR bailout issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AboutRoute() {
  return (
    <PageScaffold showBackground>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" color="white" />
          </div>
        }
      >
        <AboutPage />
      </Suspense>
    </PageScaffold>
  );
}
