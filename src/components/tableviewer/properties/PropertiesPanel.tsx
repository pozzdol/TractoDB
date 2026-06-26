import { useState } from 'react'
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

type Section = 'columns' | 'ddl' | 'info' | 'indexes' | 'fk' | 'triggers' | 'functions'

const SECTIONS: { id: Section; label: string; icon: ComponentType<IconProps> }[] = [
  { id: 'columns', label: 'Columns', icon: IconColumns },
  { id: 'ddl', label: 'DDL', icon: IconCode },
  { id: 'info', label: 'Info', icon: IconInfoCircle },
  { id: 'indexes', label: 'Indexes', icon: IconListCheck },
  { id: 'fk', label: 'Foreign Keys', icon: IconLink },
  { id: 'triggers', label: 'Triggers', icon: IconBolt },
  { id: 'functions', label: 'Functions', icon: IconMathFunction },
]

export function PropertiesPanel(props: TableTabProps) {
  const [section, setSection] = useState<Section>('columns')

  return (
    <div className={styles.panel}>
      <div className={styles.nav} role="tablist" aria-orientation="vertical">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={`${styles.navItem} ${section === id ? styles.navItemActive : ''}`}
            onClick={() => setSection(id)}
          >
            <span className={styles.navIcon}>
              <Icon size={12} />
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {section === 'columns' && <PropertiesColumns {...props} />}
        {section === 'ddl' && <PropertiesDDL {...props} />}
        {section === 'info' && <PropertiesInfo {...props} />}
        {section === 'indexes' && <PropertiesIndexes {...props} />}
        {section === 'fk' && <PropertiesFK {...props} />}
        {section === 'triggers' && <PropertiesTriggers {...props} />}
        {section === 'functions' && <PropertiesFunctions {...props} />}
      </div>
    </div>
  )
}
