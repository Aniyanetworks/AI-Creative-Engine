import React from 'react';
import { Globe, X, History as HistoryIcon } from 'lucide-react';
import { SidebarSkeleton } from './Skeletons.jsx';

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function groupOf(iso) {
  const d = new Date(iso); const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : 'Earlier';
}

export default function History({ jobs, loading, activeId, onPick, onRemove }) {
  if (loading) return <SidebarSkeleton />;
  if (!jobs.length) {
    return (
      <div className="side-empty">
        <HistoryIcon size={20} />
        <p>No runs yet</p>
        <span>Your runs will show up here.</span>
      </div>
    );
  }
  const groups = ['Today', 'Yesterday', 'Earlier'].map((g) => [g, jobs.filter((j) => groupOf(j.createdAt) === g)]).filter(([, l]) => l.length);
  return (
    <nav aria-label="Past runs" className="runs">
      {groups.map(([g, list]) => (
        <div key={g}>
          <div className="side-h">{g}</div>
          {list.map((j) => {
            const name = j.businessName || host(j.url);
            return (
              <div key={j.id} className={'runitem' + (activeId === j.id ? ' on' : '')}>
                <button className="nav" onClick={() => onPick(j.id)} aria-current={activeId === j.id ? 'true' : undefined}>
                  <span className="run-ico"><Globe size={15} /></span>
                  <span className="run-text">
                    <span className="run-name">{name}</span>
                    <span className="run-meta">{time(j.createdAt)}{j.options && j.options.dryRun ? ' · Dry run' : j.options && j.options.maxImages > 1 ? ' · Full run' : j.options ? ' · Image test' : ''}</span>
                  </span>
                </button>
                <button className="rm" onClick={() => onRemove(j)} aria-label={'Remove run ' + name} title="Remove from list"><X size={14} /></button>
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
