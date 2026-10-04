"use client";

import type { MouseEvent } from "react";
import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Play, X } from "lucide-react";
import styles from "./editorial-hero.module.css";

export function EditorialWorldCupHero() {
  const [videoActive, setVideoActive] = useState(false);
  const [videoError, setVideoError] = useState("");
  const videoDialog = useRef<HTMLDialogElement>(null);

  function navigateToSection(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  }

  function openVideo() {
    setVideoError("");
    videoDialog.current?.showModal();
    setVideoActive(true);
  }

  function closeVideo() {
    videoDialog.current?.close();
    setVideoActive(false);
  }

  return (
    <section className={styles.hero} aria-labelledby="worldcup-hero-title">
      <picture className={styles.artwork}>
        {/* The hero is the first meaningful image; do not wait for lazy loading. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/worldcup-video-stadium-fill-v1.webp" alt="" width={2172} height={724} fetchPriority="high" loading="eager" decoding="async" />
      </picture>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 id="worldcup-hero-title" className={styles.title} aria-label="WorldCup Copilot">
            <span>WorldCup</span>
            <span>Copilot</span>
          </h1>
          <p className={styles.statement}>
            把每一场比赛，<br />
            变成<strong>高光时刻。</strong>
          </p>
          <p className={styles.description}>从实时赛况到内容灵感，让每个值得讲述的瞬间被看见。</p>
          <div className={styles.actions}>
            <a href="#opportunity-pool" onClick={navigateToSection} className={styles.primary}>
              进入赛事中心 <ArrowRight size={19} aria-hidden="true" />
            </a>
            <a href="#hot-moments" onClick={navigateToSection} className={styles.secondary}>
              查看热点时刻 <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className={styles.footer}>
          <div className={styles.rule} aria-hidden="true" />
          <div className={styles.mediaControls}>
            <button type="button" className={styles.control} onClick={openVideo}
              aria-label="播放赛事短片" title="播放赛事短片" aria-haspopup="dialog">
              <Play size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
        {videoError ? <p className={styles.mediaError} role="status">{videoError}</p> : null}
      </div>
      <dialog ref={videoDialog} className={styles.videoDialog} aria-labelledby="worldcup-video-title"
        onClose={() => setVideoActive(false)}
        onClick={event => { if (event.target === event.currentTarget) closeVideo(); }}>
        <div className={styles.videoHeader}>
          <span id="worldcup-video-title">WorldCup Copilot</span>
          <button type="button" className={styles.control} onClick={closeVideo} aria-label="关闭视频" title="关闭视频" autoFocus>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {videoActive ? (
          <video className={styles.video} autoPlay controls muted playsInline preload="none"
            onError={() => { closeVideo(); setVideoError("视频暂不可用，请稍后重试。"); }}>
            <source src="/videos/worldcup-hero.mp4" type="video/mp4" />
          </video>
        ) : null}
      </dialog>
    </section>
  );
}
