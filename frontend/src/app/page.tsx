import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, Zap, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Navigation */}
      <nav className="flex items-center justify-between p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-tighter flex items-center gap-2">
          <Camera className="w-8 h-8" />
          LensAI
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/login">Get Started</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h1 className="text-6xl font-extrabold tracking-tight mb-8 max-w-4xl mx-auto leading-tight">
          The AI-Powered Photo Platform for Event Photographers
        </h1>
        <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto">
          Upload thousands of photos to Google Drive. Let our AI scan every face. Your clients find their photos instantly with a single selfie.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" className="h-14 px-8 text-lg" asChild>
            <Link href="/login">Start for Free</Link>
          </Button>
          <Button size="lg" variant="outline" className="h-14 px-8 text-lg">
            Book Demo
          </Button>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 text-left">
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900">
            <Zap className="w-10 h-10 mb-4 text-blue-500" />
            <h3 className="text-xl font-bold mb-2">Instant Face Recognition</h3>
            <p className="text-slate-500">Advanced AI detects multiple faces even in large group photos and difficult lighting.</p>
          </div>
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900">
            <Lock className="w-10 h-10 mb-4 text-green-500" />
            <h3 className="text-xl font-bold mb-2">Private & Secure</h3>
            <p className="text-slate-500">Photos sync directly to your secure Google Drive. Clients only see photos they are in.</p>
          </div>
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900">
            <ImageIcon className="w-10 h-10 mb-4 text-purple-500" />
            <h3 className="text-xl font-bold mb-2">Stunning Galleries</h3>
            <p className="text-slate-500">Beautiful, mobile-optimized masonry galleries that your clients will love to share.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
