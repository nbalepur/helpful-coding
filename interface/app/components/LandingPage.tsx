"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import IRBConsentForm from "./IRBConsentForm";
import { useAuth } from "../utils/auth";

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [videosLoaded, setVideosLoaded] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [showIRBForm, setShowIRBForm] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/browse');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    // Wait for videos to load before showing carousel
    const timer = setTimeout(() => {
      setVideosLoaded(true);
    }, 0); // Increased delay to 2 seconds
    
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = () => {
    setShowLoginForm(true);
    setShowSignupForm(false);
  };

  const handleSignUp = () => {
    setShowIRBForm(true);
    setShowLoginForm(false);
    setShowSignupForm(false);
  };

  const handleAuthSuccess = (user: any, token: string) => {
    // Use the auth context login method
    login(user, token);
    // Redirect to browse page
    router.push('/browse');
  };

  const handleSwitchToSignup = () => {
    setShowSignupForm(true);
    setShowLoginForm(false);
  };

  const handleSwitchToLogin = () => {
    setShowLoginForm(true);
    setShowSignupForm(false);
  };

  const handleCancelAuth = () => {
    setShowLoginForm(false);
    setShowSignupForm(false);
    setShowIRBForm(false);
  };

  const handleIRBAgree = () => {
    setShowIRBForm(false);
    setShowSignupForm(true);
  };

  const handleIRBCancel = () => {
    setShowIRBForm(false);
  };

  // Create demo items data
  const demoItems = [
    { id: 1, title: "Tic Tac Toe Game", video: "/api/video/tictactoe_solution/demo.mp4" },
    { id: 2, title: "Personal Website", video: "/api/video/tictactoe_solution/demo.mp4" },
    { id: 3, title: "Calculator App", video: "/api/video/tictactoe_solution/demo.mp4" },
    { id: 4, title: "Todo List", video: "/api/video/tictactoe_solution/demo.mp4" },
    { id: 5, title: "Weather App", video: "/api/video/tictactoe_solution/demo.mp4" },
  ];

  // Duplicate items for seamless infinite scroll
  const duplicatedItems = [...demoItems, ...demoItems];


  return (
    <div className="h-screen overflow-hidden bg-gray-900 text-white">
      {/* Show loading state while checking authentication */}
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      )}

      {/* Show IRB Consent Form */}
      {!isLoading && showIRBForm && (
        <IRBConsentForm
          onAgree={handleIRBAgree}
          onCancel={handleIRBCancel}
        />
      )}

      {/* Show Login Form */}
      {!isLoading && showLoginForm && (
        <LoginForm
          onSuccess={handleAuthSuccess}
          onSwitchToSignup={handleSwitchToSignup}
          onCancel={handleCancelAuth}
        />
      )}

      {/* Show Signup Form */}
      {!isLoading && showSignupForm && (
        <SignupForm
          onSuccess={handleAuthSuccess}
          onSwitchToLogin={handleSwitchToLogin}
          onCancel={handleCancelAuth}
        />
      )}

      {/* Show Landing Page Content */}
      {!isLoading && !showLoginForm && !showSignupForm && !showIRBForm && (
        <>
          {/* Main Content */}
          <div className="flex flex-col items-center h-full px-4 text-center justify-center py-8">
        {/* Header */}
        <div className="text-center w-full mb-6">
          <h1 className="text-6xl font-light mb-4 w-full text-center">
            <span className="font-semibold" style={{
              background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
              backgroundSize: '400% 400%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'gradient-shift 3s ease infinite'
            }}>
              Vibe Code Arena
            </span>
          </h1>
          <p className="text-2xl text-gray-400 mb-4">
          🚀 Build fun projects, win prizes, and show off your AI-assisted coding skills
          </p>
        </div>

                {/* Demo Windows (auto-scrolling left → right with edge fade) */}
                <div className="landing-carousel" style={{height: '33vh'}}>
          <div className="landing-slide-track" style={{opacity: videosLoaded ? 1 : 0}}>
            {duplicatedItems.map((item, index) => (
              <div key={`${item.id}-${index}`} className="landing-slide">
                <div className="bg-gray-950 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="bg-gray-800 p-2 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="ml-3 text-xs text-gray-400 font-medium">{item.title} - Demo {item.id}</span>
                    </div>
                  </div>
                  <div className="bg-gray-900" style={{height: 'calc(33vh - 40px)', display: 'flex', alignItems: 'stretch'}}>
                    <video 
                      autoPlay 
                      loop 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover" 
                      style={{pointerEvents: 'none', display: 'block', height: '100%'}}
                    >
                      <source src={item.video} type="video/mp4" />
                    </video>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <style jsx>{`
            .landing-carousel {
              background: transparent;
              height: 33vh;
              margin: 0;
              overflow: hidden;
              position: relative;
              width: 100%;
              max-width: 1200px;
            }

            .landing-carousel::before,
            .landing-carousel::after {
              content: "";
              height: 33vh;
              position: absolute;
              width: 200px;
              z-index: 2;
              pointer-events: none;
              background: linear-gradient(to right, rgba(17, 24, 39, 1) 0%, rgba(17, 24, 39, 0) 100%);
              top: 0;
            }

            .landing-carousel::after {
              right: 0;
              transform: rotateZ(180deg);
            }

            .landing-carousel::before {
              left: 0;
            }

            .landing-slide-track {
              animation: scroll 40s linear infinite;
              animation-direction: reverse;
              display: flex;
              width: calc(320px * ${duplicatedItems.length} + 1.5rem * ${duplicatedItems.length - 1});
              gap: 1.5rem;
              padding: 0 0.5rem;
              will-change: transform;
              transition: opacity 0.35s ease;
            }

            .landing-slide {
              height: 33vh;
              width: 20rem; /* 320px */
              flex-shrink: 0;
            }

            .landing-carousel:hover .landing-slide-track {
              animation-play-state: paused;
            }

            @keyframes scroll {
              0% { 
                transform: translateX(0); 
              }
              100% { 
                transform: translateX(calc(-320px * ${demoItems.length} - 1.5rem * ${demoItems.length - 1} - 1rem)); 
              }
            }

            @keyframes gradient-shift {
              0% {
                background-position: 0% 50%;
              }
              50% {
                background-position: 100% 50%;
              }
              100% {
                background-position: 0% 50%;
              }
            }
          `}</style>
        </div>

        {/* Auth Buttons */}
        <div className="flex gap-6 mt-8">
          <button
            onClick={handleLogin}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white text-base font-semibold rounded-md border border-gray-500 hover:border-gray-400 shadow"
          >
            Log In
          </button>
          <button
            onClick={handleSignUp}
            className="px-6 py-3 text-white text-base font-semibold rounded-md shadow transition-all duration-300 hover:animate-gradient-shift"
            style={{
              background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
              backgroundSize: '400% 400%',
              backgroundPosition: '0% 50%'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.animation = '';
            }}
          >
            Sign Up
          </button>
        </div>

          </div>
        </>
      )}
    </div>
  );
}
