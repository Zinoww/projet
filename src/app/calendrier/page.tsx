'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'
import {
    Calendar,
    momentLocalizer,
} from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { setDefaultOptions } from 'date-fns'
import moment from 'moment'
import 'moment/locale/fr'
import * as XLSX from 'xlsx'
import { useReactToPrint } from 'react-to-print'
import { useRouter } from 'next/navigation'


moment.locale('fr')
setDefaultOptions({ locale: fr })
const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop(Calendar)




export default function CalendrierPage() {
    const calendarRef = useRef<HTMLDivElement>(null)
    const [events, setEvents] = useState<any[]>([])
    const [filteredEvents, setFilteredEvents] = useState<any[]>([])
    const [coursList, setCoursList] = useState<any[]>([])
    const [sallesMap, setSallesMap] = useState<Map<string, string>>(new Map())
    const [selectedCours, setSelectedCours] = useState('')
    const [selectedSalle, setSelectedSalle] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const router = useRouter()

    const colorMap = new Map<string, string>()
    const getColorForId = (id: string) => {
        if (!colorMap.has(id)) {
            const hue = Math.floor(Math.random() * 360)
            colorMap.set(id, `hsl(${hue}, 70%, 60%)`)
        }
        return colorMap.get(id)!
    }

    useEffect(() => {
        const fetchEmplois = async () => {
            const { data } = await supabase
                .from('emplois_du_temps')
                .select(`
                    id,
                    date,
                    heure_debut,
                    heure_fin,
                    type,
                    cours: cours_id (id, nom),
                    salle: salle_id (id, nom)
                    `)

            if (!data) return

            const salles = new Map<string, string>()
            const coursSet: any[] = []

            const parsed = data.map((e: any) => {
                const start = parseISO(`${e.date}T${e.heure_debut}`)
                const end = parseISO(`${e.date}T${e.heure_fin}`)
                if (e.salle?.id) salles.set(e.salle.id, e.salle.nom)
                if (e.cours?.id && !coursSet.find(c => c.id === e.cours.id)) {
                    coursSet.push({ id: e.cours.id, nom: e.cours.nom })
                }
                return {
                    id: e.id,
                    title: `${e.cours?.nom || ''} (${e.salle?.nom || ''})`,
                    start,
                    end,
                    salle_id: e.salle?.id || 'unknown',
                    salle_nom: e.salle?.nom || '',
                    cours_id: e.cours?.id || 'unknown',
                    cours_nom: e.cours?.nom || ''
                }
            })

            setCoursList(coursSet)
            setSallesMap(salles)
            setEvents(parsed)
            setFilteredEvents(parsed)
        }

        fetchEmplois()
    }, [])

    useEffect(() => {
        const filtered = events.filter(e => {
            const matchCours = selectedCours ? e.cours_id === selectedCours : true
            const matchSalle = selectedSalle ? e.salle_id === selectedSalle : true
            const matchDate = startDate && endDate
                ? moment(e.start).isBetween(startDate, endDate, 'day', '[]')
                : true
            return matchCours && matchSalle && matchDate
        })
        setFilteredEvents(filtered)
    }, [selectedCours, selectedSalle, startDate, endDate, events])

    const moveEvent = async ({ event, start, end }: any) => {
        const date = moment(start).format('YYYY-MM-DD')
        const heure_debut = moment(start).format('HH:mm')
        const heure_fin = moment(end).format('HH:mm')

        const isConflict = events.some(e =>
            e.id !== event.id &&
            e.salle_id === event.salle_id &&
            moment(e.start).isSame(date, 'day') &&
            ((moment(start).isBetween(e.start, e.end, undefined, '[)')) ||
                (moment(end).isBetween(e.start, e.end, undefined, '(]')) ||
                (moment(e.start).isBetween(start, end, undefined, '[)'))
            ))
        if (isConflict) {
            alert('⚠️ Conflit détecté : un autre cours est déjà prévu dans cette salle à ce créneau.')
            return
        }

        await supabase.from('emplois_du_temps').update({
            date,
            heure_debut,
            heure_fin
        }).eq('id', event.id)

        const updatedEvents = events.map(e =>
            e.id === event.id ? { ...e, start, end } : e
        )

        setEvents(updatedEvents)
        setFilteredEvents(updatedEvents.filter(e => {
            const matchCours = selectedCours ? e.cours_id === selectedCours : true
            const matchSalle = selectedSalle ? e.salle_id === selectedSalle : true
            const matchDate = startDate && endDate
                ? moment(e.start).isBetween(startDate, endDate, 'day', '[]')
                : true
            return matchCours && matchSalle && matchDate
        }))
    }

    const handleExportExcel = () => {
        const rows = filteredEvents.map(e => ({
            Cours: e.cours_nom,
            Salle: e.salle_nom,
            Date: moment(e.start).format('YYYY-MM-DD'),
            "Heure début": moment(e.start).format('HH:mm'),
            "Heure fin": moment(e.end).format('HH:mm')
        }))

        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Planning')
        XLSX.writeFile(wb, 'planning.xlsx')
    }

    const handlePrint = useReactToPrint({
        content: () => calendarRef.current,
        documentTitle: 'planning',
        onBeforeGetContent: () => Promise.resolve(),
        removeAfterPrint: true
    } as any)

    const handleResetPlanning = async () => {
        const { error } = await supabase.from('emplois_du_temps').delete().neq('id', '')
        if (!error) {
            setEvents([])
            setFilteredEvents([])
        }
    }
    const handleEventClick = async (event: any) => {
        const confirmDelete = confirm(`Supprimer le cours "${event.title}" ?`)
        if (!confirmDelete) return

        const { error } = await supabase.from('emplois_du_temps').delete().eq('id', event.id)

        if (error) {
            alert('❌ Erreur lors de la suppression : ' + error.message)
        } else {
            const updated = events.filter(e => e.id !== event.id)
            setEvents(updated)
            setFilteredEvents(updated)
            alert('✅ Séance supprimée')
        }
    }


    return (
        <AuthGuard>
            <div className="p-6 max-w-6xl mx-auto">
                <Header />
                <h1 className="text-2xl font-bold mb-6">Vue Calendrier</h1>
                <button
                    onClick={() => router.push('/')}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                    ⬅️ Retour à l’accueil
                </button>
                <div className="flex gap-4 mb-4">
                    <select value={selectedCours} onChange={e => setSelectedCours(e.target.value)} className="border p-2 rounded">
                        <option value="">Tous les cours</option>
                        {coursList.map(c => (
                            <option key={c.id} value={c.id}>{c.nom}</option>
                        ))}
                    </select>

                    <select value={selectedSalle} onChange={e => setSelectedSalle(e.target.value)} className="border p-2 rounded">
                        <option value="">Toutes les salles</option>
                        {Array.from(sallesMap.entries()).map(([id, nom]) => (
                            <option key={id} value={id}>{nom}</option>
                        ))}
                    </select>

                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded" />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded" />
                    <button onClick={handleResetPlanning} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Réinitialiser</button>
                    <button onClick={handleExportExcel} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Exporter Excel</button>
                    <button onClick={handlePrint} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Exporter PDF</button>
                </div>

                <div ref={calendarRef}>
                    <DnDCalendar
                        localizer={localizer}
                        events={filteredEvents}
                        startAccessor={(event) => (event as any).start}
                        endAccessor={(event) => (event as any).end}
                        onEventDrop={moveEvent}
                        onSelectEvent={handleEventClick}
                        style={{ height: 600 }}
                        eventPropGetter={(event) => ({
                            style: {
                                backgroundColor: getColorForId((event as any).salle_id),
                                color: 'white',
                                borderRadius: '6px'
                            }
                        })}
                        messages={{
                            today: "Aujourd'hui",
                            previous: 'Précédent',
                            next: 'Suivant',
                            month: 'Mois',
                            week: 'Semaine',
                            day: 'Jour',
                            agenda: 'Agenda',
                            noEventsInRange: 'Aucun cours prévu'
                        }}
                    />
                </div>
            </div>
        </AuthGuard>
    )
}
