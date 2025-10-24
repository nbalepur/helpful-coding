"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface PageProps {
  params: {
    task_name: string;
  };
}

export default function TaskPage({ params }: PageProps) {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main browse page with the task parameter
    // This will trigger the main page's URL handling logic
    router.replace(`/browse?task=${params.task_name}`);
  }, [params.task_name, router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-400">Loading task...</div>
    </div>
  );
}
