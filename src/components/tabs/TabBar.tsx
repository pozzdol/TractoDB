import { useRef, type DragEvent, type KeyboardEvent } from 'react'
import { IconFileCode, IconPlus, IconTable, IconX } from '@tabler/icons-react'
import { useTabStore, type Tab } from '@/store/tabStore'
import { useConnectionStore } from '@/store/connectionStore'
import styles from './TabBar.module.css'

function tabIcon(tab: Tab) {
  return tab.type === 'table-viewer' ? <IconTable size={13} /> : <IconFileCode size={13} />
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const openQueryTab = useTabStore((s) => s.openQueryTab)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const dragIndex = useRef<number | null>(null)

  function onDrop(e: DragEvent, index: number): void {
    e.preventDefault()
    if (dragIndex.current !== null && dragIndex.current !== index) {
      reorderTabs(dragIndex.current, index)
    }
    dragIndex.current = null
  }

  function onKeyDown(e: KeyboardEvent, id: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setActiveTab(id)
    }
  }

  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
            title={tab.title}
            draggable
            onDragStart={(e) => {
              dragIndex.current = index
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, index)}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeTab(tab.id)
              }
            }}
            onKeyDown={(e) => onKeyDown(e, tab.id)}
          >
            <span className={styles.icon}>{tabIcon(tab)}</span>
            <span className={styles.label}>{tab.title}</span>
            <button
              type="button"
              className={styles.close}
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <IconX size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles.add}
        aria-label="New query tab"
        onClick={() => openQueryTab({ connectionId: activeConnectionId })}
      >
        <IconPlus size={14} />
      </button>
    </div>
  )
}
