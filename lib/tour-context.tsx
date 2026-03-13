"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

const STORAGE_KEY = "t4a_tour_completed";
const TOTAL_STEPS = 10;

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setTimeout(() => setIsActive(true), 1000);
    }
  }, []);

  function startTour() {
    setCurrentStep(0);
    setIsActive(true);
  }

  function nextStep() {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      skipTour();
    }
  }

  function prevStep() {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }

  function skipTour() {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }

  return (
    <TourContext.Provider value={{ isActive, currentStep, totalSteps: TOTAL_STEPS, startTour, nextStep, prevStep, skipTour }}>
      {children}
    </TourContext.Provider>
  );
}
