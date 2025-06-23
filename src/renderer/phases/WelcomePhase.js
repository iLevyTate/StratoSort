import React from "react";
import { usePhase } from "../contexts/PhaseContext";
const { PHASES } = require("../../shared/constants");

function WelcomePhase() {
  const { actions } = usePhase();

  const handleStart = () => {
    actions.advancePhase(PHASES.SETUP);
  };

  const handleQuickStart = () => {
    actions.advancePhase(PHASES.DISCOVER);
  };

  const features = [
    {
      icon: "🤖",
      title: "AI-Powered Analysis",
      description: "Smart file categorization using advanced AI models"
    },
    {
      icon: "📁",
      title: "Smart Folders",
      description: "Automatic organization into intelligent folders"
    },
    {
      icon: "⚡",
      title: "Fast & Secure",
      description: "Local processing keeps your files private"
    }
  ];

  return (
    <div className="phase-container">
      <div className="phase-content animate-fade-in-up">
        {/* Hero Section */}
        <div className="welcome-hero">
          <h1 className="welcome-title">
            Welcome to StratoSort
          </h1>
          <p className="welcome-subtitle">
            AI-powered file organization that learns from your preferences
          </p>
        </div>

        {/* Features Grid */}
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <span className="feature-icon">{feature.icon}</span>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button 
            onClick={handleStart}
            className="action-button"
          >
            Setup Configuration
          </button>
          <button 
            onClick={handleQuickStart}
            className="action-button-primary"
          >
            Organize My Files Now
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomePhase;
