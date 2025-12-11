"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface PageProps {
  params: {
    task_id: string;
  };
}

export default function VibeTaskPage({ params }: PageProps) {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the vibe page with the task parameter
    // This will trigger the main page's URL handling logic
    router.replace(`/vibe?task=${params.task_id}`);
  }, [params.task_id, router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-400">Loading task...</div>
    </div>
  );
}

