import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiAuthHeaders } from './apiAuth'
import {
  addTroveGroupMember,
  createTroveGroup,
  deleteTroveGroup,
  fetchTroveGroups,
  removeTroveGroupMember,
  renameTroveGroup,
  type TroveGroup,
} from './troveGroupsApi'
import type { Trove } from './types'
import { APP_VERSION } from './version'
import './App.css'

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export default function TroveGroups() {
  const [groups, setGroups] = useState<TroveGroup[]>([])
  const [troves, setTroves] = useState<Trove[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set())
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [addPickerGroupId, setAddPickerGroupId] = useState<string | null>(null)
  const [addPickerFilter, setAddPickerFilter] = useState('')
  const [addPickerSelectedIds, setAddPickerSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const [groupList, trovesRes] = await Promise.all([
        fetchTroveGroups(),
        fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } }),
      ])
      setGroups(groupList)
      if (trovesRes.ok) {
        setTroves((await trovesRes.json()) as Trove[])
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load trove groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const troveNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of troves) map.set(t.id, t.name)
    return map
  }, [troves])

  function toggleExpanded(groupId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  async function onCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    setActionError(null)
    setCreating(true)
    try {
      await createTroveGroup(name)
      setNewGroupName('')
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function onRenameGroup(group: TroveGroup) {
    const raw = window.prompt('Rename group', group.name)
    if (raw === null) return
    const name = raw.trim()
    if (!name || name === group.name) return
    setActionError(null)
    setBusy(true)
    try {
      await renameTroveGroup(group.id, name)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteGroup(group: TroveGroup) {
    if (!window.confirm(`Delete group "${group.name}"? This does not delete the troves themselves.`)) return
    setActionError(null)
    setBusy(true)
    try {
      await deleteTroveGroup(group.id)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveMember(groupId: string, troveId: string) {
    setActionError(null)
    setBusy(true)
    try {
      await removeTroveGroupMember(groupId, troveId)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  function openAddPicker(groupId: string) {
    setActionError(null)
    setAddPickerGroupId(groupId)
    setAddPickerFilter('')
    setAddPickerSelectedIds(new Set())
    setExpandedGroupIds((prev) => new Set(prev).add(groupId))
  }

  function toggleAddPickerTrove(troveId: string) {
    setAddPickerSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(troveId)) next.delete(troveId)
      else next.add(troveId)
      return next
    })
  }

  async function onConfirmAdd(groupId: string) {
    if (addPickerSelectedIds.size === 0) return
    setActionError(null)
    setBusy(true)
    try {
      for (const troveId of addPickerSelectedIds) {
        await addTroveGroupMember(groupId, troveId)
      }
      setAddPickerGroupId(null)
      setAddPickerFilter('')
      setAddPickerSelectedIds(new Set())
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="history-page trove-groups-page">
        <header className="history-header">
          <h1 className="history-title">Trove groups</h1>
          <p className="history-lead">
            Named groups of troves (aliases), shared by everyone signed in. Mirrors the{' '}
            <code className="history-detail-code" style={{ display: 'inline', padding: '0.1rem 0.3rem' }}>
              trove-aliases
            </code>{' '}
            config that <code>morsr-cli</code> reads from a local file — but editable here and stored in the database.
          </p>
          <form className="trove-groups-create-form" onSubmit={onCreateGroup}>
            <input
              type="text"
              className="trove-groups-create-input"
              placeholder="New group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              disabled={creating}
            />
            <button type="submit" className="history-refresh-btn" disabled={creating || !newGroupName.trim()}>
              {creating ? 'Creating…' : 'Create group'}
            </button>
          </form>
          {actionError && <p className="history-inline-error">{actionError}</p>}
        </header>

        {loading && <p className="history-saved-status">Loading…</p>}
        {!loading && loadError && <p className="history-inline-error">{loadError}</p>}
        {!loading && !loadError && groups.length === 0 && (
          <p className="history-empty">No trove groups yet. Create one above.</p>
        )}
        {!loading && !loadError && groups.length > 0 && (
          <div className="history-table-wrap">
            <table className="history-table trove-groups-table">
              <thead>
                <tr>
                  <th scope="col" aria-label="Expand" />
                  <th scope="col">Group</th>
                  <th scope="col">Troves</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const expanded = expandedGroupIds.has(group.id)
                  const availableTroves = troves
                    .filter((t) => !group.troveIds.includes(t.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                  return (
                    <Fragment key={group.id}>
                      <tr className="trove-groups-row">
                        <td>
                          <button
                            type="button"
                            className="trove-groups-expand-btn"
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                            onClick={() => toggleExpanded(group.id)}
                          >
                            <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
                          </button>
                        </td>
                        <td>{group.name}</td>
                        <td className="history-cell-num">{group.troveIds.length}</td>
                        <td className="trove-groups-actions-cell">
                          <button
                            type="button"
                            className="trove-groups-add-btn"
                            title="Add a trove to this group"
                            disabled={busy}
                            onClick={() => openAddPicker(group.id)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="history-save-btn"
                            disabled={busy}
                            onClick={() => onRenameGroup(group)}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="trove-groups-trash-btn"
                            title="Delete group"
                            aria-label={`Delete group ${group.name}`}
                            disabled={busy}
                            onClick={() => onDeleteGroup(group)}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                      {expanded && group.troveIds.length === 0 && addPickerGroupId !== group.id && (
                        <tr className="trove-groups-child-row">
                          <td />
                          <td colSpan={3} className="trove-groups-empty-cell">
                            No troves in this group yet.
                          </td>
                        </tr>
                      )}
                      {expanded &&
                        group.troveIds.map((troveId) => (
                          <tr className="trove-groups-child-row" key={troveId}>
                            <td />
                            <td colSpan={2}>{troveNameById.get(troveId) ?? troveId}</td>
                            <td className="trove-groups-actions-cell">
                              <button
                                type="button"
                                className="trove-groups-trash-btn"
                                title="Remove from group"
                                aria-label={`Remove ${troveNameById.get(troveId) ?? troveId} from ${group.name}`}
                                disabled={busy}
                                onClick={() => onRemoveMember(group.id, troveId)}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))}
                      {expanded && addPickerGroupId === group.id && (() => {
                        const filterLower = addPickerFilter.trim().toLowerCase()
                        const filteredTroves = filterLower
                          ? availableTroves.filter((t) => t.name.toLowerCase().includes(filterLower))
                          : availableTroves
                        return (
                          <tr className="trove-groups-child-row trove-groups-add-row">
                            <td />
                            <td colSpan={3}>
                              <div className="trove-groups-add-picker">
                                <div className="sidebar-trove-filter-wrap">
                                  <input
                                    type="text"
                                    value={addPickerFilter}
                                    onChange={(e) => setAddPickerFilter(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setAddPickerFilter('')
                                      }
                                    }}
                                    placeholder="Filter troves…"
                                    className="sidebar-trove-filter-input"
                                    aria-label="Filter troves to add"
                                    disabled={busy}
                                    autoFocus
                                  />
                                  {addPickerFilter && (
                                    <button
                                      type="button"
                                      className="sidebar-trove-filter-clear"
                                      onClick={() => setAddPickerFilter('')}
                                      aria-label="Clear filter"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                                <ul className="trove-list trove-groups-add-list">
                                  {filteredTroves.length === 0 && (
                                    <li className="trove-groups-add-list-empty">No matching troves.</li>
                                  )}
                                  {filteredTroves.map((t) => (
                                    <li
                                      key={t.id}
                                      className={`trove-item ${addPickerSelectedIds.has(t.id) ? 'trove-item--selected' : ''}`}
                                    >
                                      <label className="trove-checkbox">
                                        <input
                                          type="checkbox"
                                          checked={addPickerSelectedIds.has(t.id)}
                                          disabled={busy}
                                          onChange={() => toggleAddPickerTrove(t.id)}
                                        />
                                        <span className="trove-name">{t.name}</span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                                <div className="trove-groups-add-picker-actions">
                                  <button
                                    type="button"
                                    className="history-save-btn"
                                    disabled={busy || addPickerSelectedIds.size === 0}
                                    onClick={() => onConfirmAdd(group.id)}
                                  >
                                    {addPickerSelectedIds.size > 0
                                      ? `Add ${addPickerSelectedIds.size} trove${addPickerSelectedIds.size === 1 ? '' : 's'}`
                                      : 'Add'}
                                  </button>
                                  <button
                                    type="button"
                                    className="history-save-btn"
                                    disabled={busy}
                                    onClick={() => setAddPickerGroupId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })()}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <span className="app-footer-text">
          GitHub:{' '}
          <a target="_blank" rel="noopener noreferrer" href="https://github.com/cschuyle/morsor">
            https://github.com/cschuyle/morsor
          </a>
          {' · '}
          Version {APP_VERSION}
        </span>
        <Link to="/" className="app-footer-link">
          Query console
        </Link>
        {' · '}
        <Link to="/about" className="app-footer-link">
          About
        </Link>
        {' · '}
        <Link to="/history" className="app-footer-link">
          History
        </Link>
      </footer>
    </>
  )
}
