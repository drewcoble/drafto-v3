import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { Table, Text, Loader, Center } from '@mantine/core'
import { api } from '../../convex/_generated/api'
import type { Position } from '../types'

interface ProjectionsTableProps {
  position: Position
  week: string
}

export function ProjectionsTable({ position, week }: ProjectionsTableProps) {
  const rows = useQuery(api.projections.getProjections, { position, week })

  // Stat columns differ by position (QB has PASSING_YDS, DST has MISC_SACK,
  // etc.) so we derive the column set from whatever the first row contains.
  const statKeys = useMemo(() => {
    if (!rows || rows.length === 0) return []
    const [first] = rows
    return first ? Object.keys(first.stats) : []
  }, [rows])

  if (rows === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }

  if (rows.length === 0) {
    return <Text c="dimmed">No projections yet for {position} — run the scraper first.</Text>
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Player</Table.Th>
          <Table.Th>Team</Table.Th>
          {statKeys.map((key) => (
            <Table.Th key={key}>{key}</Table.Th>
          ))}
          <Table.Th>FPTS</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row._id}>
            <Table.Td>{row.playerName}</Table.Td>
            <Table.Td>{row.team ?? '—'}</Table.Td>
            {statKeys.map((key) => (
              <Table.Td key={key}>{row.stats[key] ?? '—'}</Table.Td>
            ))}
            <Table.Td>{row.fpts.toFixed(1)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
