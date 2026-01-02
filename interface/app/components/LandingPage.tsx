"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import IRBConsentForm from "./IRBConsentForm";
import { useAuth } from "../utils/auth";
import LoadingSpinner from "./LoadingSpinner";

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [videosLoaded, setVideosLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [showIRBForm, setShowIRBForm] = useState(false);

  // Set mounted state to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Generate stars only on client side to avoid hydration mismatch
  const backgroundStars = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        largeStars: [],
        mediumStars: [],
        smallDots: [],
        animatedDots: [],
      };
    }

    const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];
    const animatedColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

    const makeStars = (count: number, sizeRange: [number, number], opacityRange: [number, number]) =>
      Array.from({ length: count }, () => ({
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0],
        left: Math.random() * 100,
        top: Math.random() * 100,
        opacity: Math.random() * (opacityRange[1] - opacityRange[0]) + opacityRange[0],
      }));

    const makeAnimatedDots = () =>
      Array.from({ length: 12 }, () => ({
        color: animatedColors[Math.floor(Math.random() * animatedColors.length)],
        size: Math.random() * 8 + 4,
        top: Math.random() * 100,
        duration: Math.random() * 30 + 40,
        delay: Math.random() * 5,
        direction: (Math.random() > 0.5 ? 'left-to-right' : 'right-to-left') as 'left-to-right' | 'right-to-left',
        opacity: Math.random() * 0.6 + 0.4,
      }));

    return {
      largeStars: makeStars(20, [2, 4], [0.4, 0.6]),
      mediumStars: makeStars(40, [1, 2], [0.3, 0.5]),
      smallDots: makeStars(100, [0.5, 1.5], [0.2, 0.4]),
      animatedDots: makeAnimatedDots(),
    };
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/browse');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    // Wait for videos to load before showing carousel
    if (isMounted) {
      const timer = setTimeout(() => {
        setVideosLoaded(true);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isMounted]);

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
    // Redirect to vibe page
    router.push('/vibe');
  };

  const handleSwitchToSignup = () => {
    setShowIRBForm(true);
    setShowLoginForm(false);
    setShowSignupForm(false);
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
    { id: 1, title: "Tic Tac Toe", video: "/videos/tic_tac_toe.mp4" },
    { id: 2, title: "Endless Runner", video: "/videos/flappy_penguin.mp4" },
    { id: 3, title: "Connect Four", video: "/videos/connect_four.mp4" },
    { id: 4, title: "Typing Test", video: "/videos/typing_test.mp4" },
    { id: 5, title: "Breakout", video: "/videos/breakout.mp4" },
  ];

  // Duplicate items for seamless infinite scroll
  const duplicatedItems = [...demoItems, ...demoItems];


  // Prevent hydration mismatch by not rendering content until mounted
  if (!isMounted) {
    return (
      <div className="h-screen overflow-hidden bg-gray-900 text-white relative">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <LoadingSpinner size="xl" color="white" className="mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${showIRBForm ? 'min-h-screen overflow-y-auto' : 'h-screen overflow-hidden'} bg-gray-900 text-white relative`}>
      {/* Space Theme with Jam-Colored Stars */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Large stars */}
        {backgroundStars.largeStars.map((star, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 2}px ${star.color}, 0 0 ${star.size * 4}px ${star.color}`,
            }}
          />
        ))}
        
        {/* Medium stars */}
        {backgroundStars.mediumStars.map((star, i) => (
          <div
            key={`medium-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 1.5}px ${star.color}`,
            }}
          />
        ))}
        
        {/* Small twinkling dots */}
        {backgroundStars.smallDots.map((dot, i) => (
          <div
            key={`dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              backgroundColor: dot.color,
              opacity: dot.opacity,
            }}
          />
        ))}
        
        {/* Animated jam-like dots moving across screen */}
        {backgroundStars.animatedDots.map((dot, i) => (
          <div
            key={`animated-dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              top: `${dot.top}%`,
              left: dot.direction === 'left-to-right' ? '-20px' : 'calc(100% + 20px)',
              backgroundColor: dot.color,
              opacity: dot.opacity,
              boxShadow: `0 0 ${dot.size * 1.5}px ${dot.color}, 0 0 ${dot.size * 3}px ${dot.color}`,
              animation: `moveAcross${dot.direction === 'left-to-right' ? 'Right' : 'Left'} ${dot.duration}s linear ${dot.delay}s infinite`,
            }}
          />
        ))}
      </div>
      {/* Show loading state while checking authentication */}
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <LoadingSpinner size="xl" color="white" className="mx-auto mb-4" />
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
          <div className="flex flex-col items-center h-full px-4 text-center justify-center py-8 relative z-10">
        {/* Header */}
        <div className="text-center w-full mb-6">
          <div className="flex flex-row items-center justify-center mb-4 gap-4">
            <img src="/toast.png" alt="Toast" className="h-16 w-auto object-contain" />
            <h1 className="text-6xl font-light text-center">
              <span className="font-semibold" style={{
                background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                backgroundSize: '400% 400%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'gradient-shift 3s ease infinite'
              }}>
                Vibe Jam
              </span>
            </h1>
          </div>
          <p className="text-2xl text-gray-400 mb-4">
            Build fun projects, win prizes, and show off your AI-assisted coding skills
          </p>
        </div>

                {/* Demo Windows (auto-scrolling left → right with edge fade) */}
                <div className="landing-carousel" style={{height: '33vh'}}>
          <div className="landing-slide-track" style={{opacity: (isMounted && videosLoaded) ? 1 : 0}}>
            {duplicatedItems.map((item, index) => (
              <div key={`${item.id}-${index}`} className="landing-slide">
                <div className="bg-gray-950 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="bg-gray-800 p-2 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="ml-3 text-xs text-gray-400 font-medium">{item.title}</span>
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
