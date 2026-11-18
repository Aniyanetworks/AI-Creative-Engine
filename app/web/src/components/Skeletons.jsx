import React from 'react';

export const Bone = ({ w = '100%', h = 14, r = 8, style }) => (
  <span className="bone" aria-hidden style={{ width: w, height: h, borderRadius: r, ...style }} />
);

export function SidebarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading runs">
      <div className="side-h">Recent runs</div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skel-run">
          <Bone w={30} h={30} r={9} />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}><Bone w={i % 2 ? '70%' : '85%'} h={11} /><Bone w="55%" h={9} /></div>
        </div>
      ))}
    </div>
  );
}

export function RunSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading run">
      <section className="card">
        <div className="runhead">
          <div style={{ display: 'grid', gap: 10, flex: 1 }}><Bone w="38%" h={22} /><Bone w="22%" h={12} /></div>
          <Bone w={84} h={26} r={999} />
        </div>
        <Bone h={8} r={999} style={{ marginTop: 22 }} />
        <div className="phases" style={{ marginTop: 26 }}>
          {[3, 4, 2].map((n, i) => (
            <div key={i} style={{ display: 'grid', gap: 12 }}>
              <Bone w={70} h={10} />
              {Array.from({ length: n }).map((_, k) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Bone w={22} h={22} r={999} /><Bone w={k % 2 ? '60%' : '75%'} h={12} /></div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <div className="summary">
        {[0, 1, 2].map((i) => <div key={i} className="stat" style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Bone w={40} h={40} r={11} /><div style={{ flex: 1, display: 'grid', gap: 8 }}><Bone w="40%" h={20} /><Bone w="65%" h={10} /></div></div>)}
      </div>
    </div>
  );
}
