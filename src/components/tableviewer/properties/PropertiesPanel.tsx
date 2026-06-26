import {
  IconBolt,
  IconCode,
  IconColumns,
  IconInfoCircle,
  IconLink,
  IconListCheck,
  IconMathFunction,
  type IconProps,
} from '@tabler/icons-react'
import type { ComponentType } from 'react'
import type { TableTabProps } from '../TableViewer'
import { PropertiesColumns } from './PropertiesColumns'
import { PropertiesDDL } from './PropertiesDDL'
import { PropertiesFK } from './PropertiesFK'
import { PropertiesFunctions } from './PropertiesFunctions'
import { PropertiesIndexes } from './PropertiesIndexes'
import { PropertiesInfo } from './PropertiesInfo'
import { PropertiesTriggers } from './PropertiesTriggers'
import styles from './Properties.module.css'

export type Section = 'columns' | 'ddl' | 'info' | 'indexes' | 'fk' | 'triggers' | 'functions'

interface PropertiesPanelProps extends TableTabProps {
  /** Lifted to TableViewer so the section survives Data↔Properties switches. */
  activeSection: Section
  onSectionChange: (section: Section) => void
}

const SECTIONS: { id: Section; label: string; icon: ComponentType<IconProps> }[] = [
  { id: 'columns', label: 'Columns', icon: IconColumns },
  { id: 'ddl', label: 'DDL', icon: IconCode },
  { id: 'info', label: 'Info', icon: IconInfoCircle },
  { id: 'indexes', label: 'Indexes', icon: IconListCheck },
  { id: 'fk', label: 'Foreign Keys', icon: IconLink },
  { id: 'triggers', label: 'Triggers', icon: IconBolt },
  { id: 'functions', label: 'Functions', icon: IconMathFunction },
]

export function PropertiesPanel({ activeSection, onSectionChange, ...props }: PropertiesPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.nav} role="tablist" aria-orientation="vertical">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeSection === id}
            className={`${styles.navItem} ${activeSection === id ? styles.navItemActive : ''}`}
            onClick={() => onSectionChange(id)}
          >
            <span className={styles.navIcon}>
              <Icon size={12} />
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {activeSection === 'columns' && <PropertiesColumns {...props} />}
        {activeSection === 'ddl' && <PropertiesDDL {...props} />}
        {activeSection === 'info' && <PropertiesInfo {...props} />}
        {activeSection === 'indexes' && <PropertiesIndexes {...props} />}
        {activeSection === 'fk' && <PropertiesFK {...props} />}
        {activeSection === 'triggers' && <PropertiesTriggers {...props} />}
        {activeSection === 'functions' && <PropertiesFunctions {...props} />}
      </div>
    </div>
  )
}
