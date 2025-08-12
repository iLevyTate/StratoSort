import React, { useEffect, useRef } from 'react';

/**
 * TooltipManager
 * - Replaces native title tooltips with a unified, GPU-accelerated style
 * - Uses event delegation for performance
 * - No API change: developers can keep using the title attribute
 */
export default function TooltipManager() {
  const tooltipRef = useRef(null);
  const arrowRef = useRef(null);
  const currentTargetRef = useRef(null);
  const titleCacheRef = useRef(new WeakMap());
  const rafRef = useRef(0);

  useEffect(() => {
    // Create tooltip container once
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-enhanced';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
    tooltip.style.transform = 'translate3d(-10000px, -10000px, 0)';

    const arrow = document.createElement('div');
    arrow.className = 'tooltip-arrow';
    arrow.style.position = 'absolute';
    arrow.style.width = '8px';
    arrow.style.height = '8px';
    tooltip.appendChild(arrow);

    document.body.appendChild(tooltip);
    tooltipRef.current = tooltip;
    arrowRef.current = arrow;

    const schedule = (cb) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(cb);
    };

    const showTooltip = (target) => {
      if (!tooltipRef.current) return;
      const title = target.getAttribute('data-tooltip') || target.getAttribute('title');
      if (!title) return;

      // Prevent native tooltip by clearing title temporarily
      if (target.hasAttribute('title')) {
        if (!titleCacheRef.current.get(target)) {
          titleCacheRef.current.set(target, title);
        }
        target.setAttribute('data-title', title);
        target.removeAttribute('title');
      }

      tooltipRef.current.textContent = title;
      tooltipRef.current.appendChild(arrowRef.current);
      tooltipRef.current.classList.add('show');
      tooltipRef.current.style.opacity = '1';

      positionTooltip(target);
    };

    const hideTooltip = (target) => {
      if (!tooltipRef.current) return;
      tooltipRef.current.classList.remove('show');
      tooltipRef.current.style.opacity = '0';
      tooltipRef.current.style.transform = 'translate3d(-10000px, -10000px, 0)';

      // Restore native title
      const cached = titleCacheRef.current.get(target);
      if (cached && !target.getAttribute('title')) {
        target.setAttribute('title', cached);
      }
      target.removeAttribute('data-title');
    };

    const positionTooltip = (target) => {
      schedule(() => {
        if (!tooltipRef.current || !arrowRef.current) return;
        const rect = target.getBoundingClientRect();
        const tooltip = tooltipRef.current;
        const arrow = arrowRef.current;

        // Measure tooltip size by placing it off-screen first
        tooltip.style.top = '0px';
        tooltip.style.left = '0px';
        tooltip.style.transform = 'translate3d(-10000px, -10000px, 0)';

        const { width: tw, height: th } = tooltip.getBoundingClientRect();

        const margin = 10; // distance from target
        let top = rect.top - th - margin;
        let left = rect.left + rect.width / 2 - tw / 2;
        let placement = 'top';

        // Flip to bottom if not enough space on top
        if (top < 8) {
          top = rect.bottom + margin;
          placement = 'bottom';
        }

        // Constrain horizontally within viewport
        const vw = window.innerWidth;
        if (left < 8) left = 8;
        if (left + tw > vw - 8) left = vw - 8 - tw;

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.style.transform = 'translate3d(0, 0, 0)';

        // Arrow positioning
        const arrowSize = 8;
        const arrowOffset = rect.left + rect.width / 2 - left - arrowSize / 2;
        arrow.style.left = `${Math.max(arrowSize, Math.min(tw - arrowSize * 2, arrowOffset))}px`;
        if (placement === 'top') {
          arrow.style.top = `${th - arrowSize / 2}px`;
        } else {
          arrow.style.top = `-${arrowSize / 2}px`;
        }
      });
    };

    const delegatedMouseOver = (e) => {
      const target = e.target.closest('[title], [data-tooltip]');
      if (!target || !(target instanceof HTMLElement)) return;
      currentTargetRef.current = target;
      showTooltip(target);
    };

    const delegatedMouseOut = (e) => {
      const target = currentTargetRef.current;
      if (!target) return;
      // Only hide when leaving the element completely
      if (!target.contains(e.relatedTarget)) {
        hideTooltip(target);
        currentTargetRef.current = null;
      }
    };

    const delegatedFocus = (e) => {
      const target = e.target.closest('[title], [data-tooltip]');
      if (!target || !(target instanceof HTMLElement)) return;
      currentTargetRef.current = target;
      showTooltip(target);
    };

    const delegatedBlur = () => {
      if (currentTargetRef.current) {
        hideTooltip(currentTargetRef.current);
        currentTargetRef.current = null;
      }
    };

    document.addEventListener('mouseover', delegatedMouseOver, true);
    document.addEventListener('mouseout', delegatedMouseOut, true);
    document.addEventListener('focusin', delegatedFocus);
    document.addEventListener('focusout', delegatedBlur);
    // Keep tooltip anchored on scroll/resize
    const handleViewportChange = () => {
      if (currentTargetRef.current) positionTooltip(currentTargetRef.current);
    };
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('mouseover', delegatedMouseOver, true);
      document.removeEventListener('mouseout', delegatedMouseOut, true);
      document.removeEventListener('focusin', delegatedFocus);
      document.removeEventListener('focusout', delegatedBlur);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
      if (tooltipRef.current && tooltipRef.current.parentNode) {
        tooltipRef.current.parentNode.removeChild(tooltipRef.current);
      }
    };
  }, []);

  return null;
}


