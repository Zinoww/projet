'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { genererEmploiDuTemps, Session } from '@/src/lib/generation'
import moment from 'moment'
import 'moment/locale/fr'
import * as XLSX from 'xlsx'
import { PDFDownloadLink } from '@react-pdf/renderer'
import PDFPlanning from '@/src/components/PDFPlanning'

import { Calendar, momentLocalizer } from 'react-big-calendar'
import withDragAndDrop, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'

moment.locale('fr');

type CalendarEvent = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource?: any;
    type: string;
    enseignant_id: string;
    salle_id: string;
};

const DnDCalendar = withDragAndDrop(Calendar)

export default function EmploiDuTempsPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [pdfData, setPdfData] = useState<any[]>([])
    const [groupes, setGroupes] = useState<any[]>([])
    const [selectedGroupe, setSelectedGroupe] = useState<string>('')

    const localizer = momentLocalizer(moment)

    const fetchGroupes = async () => {
        const { data } = await supabase.from('groupes').select('*')
        if (data) setGroupes(data)
    }

    const fetchEvents = async () => {
        let query = supabase
            .from('emplois_du_temps')
            .select(`
                id, date, heure_debut, heure_fin, type,
                cours:cours_id ( nom ),
                salles:salle_id ( id, nom ),
                enseignants:enseignant_id ( id, nom )
            `)

        // Filtrer par groupe si sélectionné (temporairement désactivé)
        // if (selectedGroupe) {
        //     query = query.eq('cours.groupe_id', selectedGroupe)
        // }

        const { data, error } = await query

        if (error) {
            setMessage('Erreur chargement des événements: ' + error.message)
            return []
        }

        console.log('=== DEBUG PAGE ===');
        console.log('Données récupérées de Supabase:', data);
        console.log('Nombre de créneaux:', data?.length || 0);

        const calendarEvents = data.map((e: any) => ({
            id: e.id,
            title: `[${e.type}] ${e.cours.nom} - ${e.enseignants.nom} (${e.salles.nom})`,
            start: moment(`${e.date}T${e.heure_debut}`).toDate(),
            end: moment(`${e.date}T${e.heure_fin}`).toDate(),
            resource: { salle: e.salles.nom },
            type: e.type,
            enseignant_id: e.enseignants.id,
            salle_id: e.salles.id
        }));
        setEvents(calendarEvents);
        setPdfData(data); // Stocker les données pour le PDF
        console.log('PDF Data stockée:', data);
    }

    useEffect(() => {
        fetchGroupes()
        fetchEvents()
    }, [selectedGroupe])

    const handleExportExcel = async () => {
        if (events.length === 0) {
            setMessage('Aucun emploi du temps à exporter')
            return
        }

        try {
            // Récupérer les données complètes pour l'export
            const { data, error } = await supabase
                .from('emplois_du_temps')
                .select(`
                    date, heure_debut, heure_fin, type,
                    cours:cours_id ( nom ),
                    salles:salle_id ( nom ),
                    enseignants:enseignant_id ( nom )
                `)

            if (error) {
                setMessage('Erreur lors de la récupération des données: ' + error.message)
                return
            }

            // Préparer les données pour l'export
            const exportData = data.map((item: any) => ({
                'Date': item.date,
                'Heure début': item.heure_debut,
                'Heure fin': item.heure_fin,
                'Type': item.type,
                'Cours': item.cours.nom,
                'Enseignant': item.enseignants.nom,
                'Salle': item.salles.nom
            }))

            // Créer le workbook et worksheet
            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Emploi du temps')

            // Générer le nom du fichier avec la date actuelle
            const fileName = `emploi_du_temps_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`

            // Télécharger le fichier
            XLSX.writeFile(wb, fileName)
            setMessage('Emploi du temps exporté avec succès !')

        } catch (error) {
            setMessage('Erreur lors de l\'export: ' + error)
        }
    }

    const handleGenerate = async () => {
        if (!confirm("Voulez-vous supprimer le planning actuel et en générer un nouveau ?")) return;

        setLoading(true)
        setMessage('Génération en cours...')

        const { error: deleteError } = await supabase.from('emplois_du_temps').delete().gt('id', 0)
        if (deleteError) {
            setMessage("Erreur lors de la suppression de l'ancien planning: " + deleteError.message)
            setLoading(false)
            return
        }

        const sessions = await genererEmploiDuTemps(setMessage)

        if (sessions.length === 0) {
            setMessage('Impossible de générer un emploi du temps.')
            setLoading(false)
            return
        }
        
        const sessionsToInsert = sessions.map(s => ({
            cours_id: s.cours_id,
            salle_id: s.salle_id,
            enseignant_id: s.enseignant_id,
            date: s.date,
            heure_debut: s.heure_debut,
            heure_fin: s.heure_fin,
            type: s.type,
        }))

        const { error: insertError } = await supabase.from('emplois_du_temps').insert(sessionsToInsert)

        if (insertError) {
            setMessage("Erreur lors de l'insertion du nouveau planning: " + insertError.message)
        } else {
            setMessage('Planning généré avec succès !')
            await fetchEvents()
        }
        setLoading(false)
    }

    const onEventDrop: withDragAndDropProps['onEventDrop'] = async ({ event, start, end }) => {
        const draggedEvent = event as CalendarEvent;

        const hasConflict = events
            .filter(e => e.id !== draggedEvent.id)
            .some(e => {
                const isTimeConflict = start < e.end && end > e.start;
                if (!isTimeConflict) return false;

                const isSameTeacher = e.enseignant_id === draggedEvent.enseignant_id;
                const isSameRoom = e.salle_id === draggedEvent.salle_id;

                return isSameTeacher || isSameRoom;
            });

        if (hasConflict) {
            alert("Conflit détecté ! L'enseignant ou la salle est déjà occupé sur ce créneau.");
            return;
        }

        const { error } = await supabase
            .from('emplois_du_temps')
            .update({
                date: moment(start).format('YYYY-MM-DD'),
                heure_debut: moment(start).format('HH:mm'),
                heure_fin: moment(end).format('HH:mm'),
            })
            .eq('id', draggedEvent.id)

        if (error) {
            alert("Erreur lors de la mise à jour.")
            return;
        }
        await fetchEvents();
    };

    const handleDoubleClickEvent = async (event: object) => {
        const calEvent = event as CalendarEvent;
        if (!confirm(`Supprimer le créneau "${calEvent.title}" ?`)) return;

        const { error } = await supabase.from('emplois_du_temps').delete().eq('id', calEvent.id);

        if (error) {
            alert("Erreur lors de la suppression : " + error.message);
        } else {
            setEvents(prev => prev.filter(e => e.id !== calEvent.id));
        }
    }

    const eventStyleGetter = (event: object) => {
        const calEvent = event as CalendarEvent;
        let backgroundColor = '#3174ad'; // Bleu pour "Cours"
        if (calEvent.type === 'TD') backgroundColor = '#5cb85c'; // Vert
        if (calEvent.type === 'TP') backgroundColor = '#f0ad4e'; // Jaune

        return {
            style: { backgroundColor, color: 'white', borderRadius: '5px', border: 'none' }
        };
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Emploi du temps</h1>

            <div className="flex gap-4 mb-4">
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                >
                    {loading ? 'Génération...' : 'Générer un nouveau planning'}
                </button>

                <select
                    value={selectedGroupe}
                    onChange={(e) => setSelectedGroupe(e.target.value)}
                    className="border p-2 rounded"
                >
                    <option value="">Tous les groupes</option>
                    {groupes.map(groupe => (
                        <option key={groupe.id} value={groupe.id}>
                            {groupe.nom} {groupe.niveau && `(${groupe.niveau})`}
                        </option>
                    ))}
                </select>

                <button
                    onClick={handleExportExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                    📊 Exporter Excel
                </button>

                <button
                    onClick={() => {
                        console.log('=== DEBUG PDF BUTTON CLICK ===');
                        console.log('PDF Data length:', pdfData.length);
                        console.log('PDF Data:', pdfData);
                    }}
                    className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                >
                    🔍 Debug PDF Data
                </button>

                {pdfData.length > 0 && (
                    <PDFDownloadLink
                        document={<PDFPlanning data={pdfData} selectedGroupe={selectedGroupe} groupes={groupes} />}
                        fileName={`planning_${selectedGroupe ? groupes.find(g => g.id === selectedGroupe)?.nom || 'groupe' : 'tous'}_${moment().format('YYYY-MM-DD')}.pdf`}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                    >
                        {({ blob, url, loading, error }) =>
                            loading ? 'Génération PDF...' : '📄 Exporter PDF'
                        }
                    </PDFDownloadLink>
                )}
            </div>

            {message && <p className="text-sm text-gray-700 mb-4">{message}</p>}

            <DnDCalendar
                localizer={localizer}
                events={events}
                onEventDrop={onEventDrop}
                onDoubleClickEvent={handleDoubleClickEvent}
                eventPropGetter={eventStyleGetter}
                resizable
                startAccessor={(event) => (event as CalendarEvent).start}
                endAccessor={(event) => (event as CalendarEvent).end}
                style={{ height: 600 }}
                defaultView="week"
                views={['day', 'week', 'month']}
                min={new Date(1970, 1, 1, 8, 0)}
                max={new Date(1970, 1, 1, 17, 0)}
                step={30}
                timeslots={3}
                messages={{
                    today: "Aujourd'hui",
                    previous: 'Précédent',
                    next: 'Suivant',
                    month: 'Mois',
                    week: 'Semaine',
                    day: 'Jour',
                    agenda: 'Agenda',
                    noEventsInRange: 'Aucun cours prévu dans cette période.'
                }}
            />
        </div>
    )
}
