import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { IconFileCode, IconPlus, IconTable, IconX } from '@tabler/icons-react'
import { useTabStore, type Tab } from '@/store/tabStore'
import { useConnectionStore } from '@/store/connectionStore'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import styles from './TabBar.module.css'

function tabIcon(tab: Tab) {
  return tab.type === 'table-viewer' ? <IconTable size={13} /> : <IconFileCode size={13} />
}

/** A query tab with content the user would lose on close. */
function isUnsaved(tab: Tab): boolean {
  return tab.type === 'query-editor' && tab.sql.trim().length > 0
}

interface MenuState {
  x: number
  y: number
  tabId: string
}

interface ConfirmState {
  count: number
  run: () => void
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const openQueryTab = useTabStore((s) => s.openQueryTab)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const dirtyTabs = useTabStore((s) => s.dirtyTabs)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const dragIndex = useRef<number | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // A tab with changes the user would lose: typed query SQL, or staged table edits.
  const tabUnsaved = (tab: Tab): boolean =>
    isUnsaved(tab) || (tab.type === 'table-viewer' && dirtyTabs.has(tab.id))

  /** Close one tab, confirming first if it has unsaved changes. */
  function requestClose(id: string): void {
    const tab = tabs.find((t) => t.id === id)
    if (tab && tabUnsaved(tab)) {
      setConfirm({ count: 1, run: () => closeTab(id) })
    } else {
      closeTab(id)
    }
  }

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

  /** Close the given tabs; reactivate the kept target if it survives. */
  function closeMany(ids: string[], keepId: string | null): void {
    const run = (): void => {
      ids.forEach((id) => closeTab(id))
      if (keepId && !ids.includes(keepId)) setActiveTab(keepId)
    }
    const unsaved = ids.filter((id) => {
      const t = tabs.find((x) => x.id === id)
      return t ? tabUnsaved(t) : false
    }).length
    if (unsaved > 0) setConfirm({ count: unsaved, run })
    else run()
  }

  function openMenu(e: MouseEvent, tabId: string): void {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  function menuItems(tabId: string): ContextMenuItem[] {
    const index = tabs.findIndex((t) => t.id === tabId)
    const last = tabs.length - 1
    const idsLeft = tabs.slice(0, index).map((t) => t.id)
    const idsRight = tabs.slice(index + 1).map((t) => t.id)
    const idsOthers = tabs.filter((t) => t.id !== tabId).map((t) => t.id)
    return [
      { label: 'Close', onClick: () => closeMany([tabId], tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null) },
      { label: 'sep', separator: true },
      {
        label: 'Close Others',
        disabled: tabs.length <= 1,
        onClick: () => closeMany(idsOthers, tabId),
      },
      { label: 'Close All', onClick: () => closeMany(tabs.map((t) => t.id), null) },
      {
        label: 'Close Tabs to the Left',
        disabled: index <= 0,
        onClick: () => closeMany(idsLeft, tabId),
      },
      {
        label: 'Close Tabs to the Right',
        disabled: index >= last,
        onClick: () => closeMany(idsRight, tabId),
      },
    ]
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
            onContextMenu={(e) => openMenu(e, tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                requestClose(tab.id)
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
                requestClose(tab.id)
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

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.tabId)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {confirm ? (
        <Modal
          title="Unsaved changes"
          size="sm"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  confirm.run()
                  setConfirm(null)
                }}
              >
                Close
              </Button>
            </>
          }
        >
          <p>
            Close {confirm.count} tab{confirm.count === 1 ? '' : 's'} with unsaved changes?
          </p>
        </Modal>
      ) : null}
    </div>
  )
}
