'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { genererEmploiDuTemps, Session } from '@/src/lib/generation'
import moment from 'moment'
import 'moment/locale/fr'
import * as XLSX from 'xlsx'

import { Calendar, momentLocalizer, View } from 'react-big-calendar'
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
    const [currentDate, setCurrentDate] = useState(new Date())
    const [currentView, setCurrentView] = useState<View>('week')

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
                cours:cours_id ( nom, groupe_id ),
                salles:salle_id ( id, nom ),
                enseignants:enseignant_id ( id, nom )
            `)

        // Filtrer par groupe si sélectionné
        if (selectedGroupe) {
            query = query.eq('cours.groupe_id', selectedGroupe)
        }

        const { data, error } = await query

        if (error) {
            setMessage('Erreur chargement des événements: ' + error.message)
            return []
        }

        console.log('=== DEBUG PAGE ===');
        console.log('Données récupérées de Supabase:', data);
        console.log('Nombre de créneaux:', data?.length || 0);

        const calendarEvents = data
            .filter((e: any) => e.cours && e.cours.nom && e.enseignants && e.salles) // Filtrer les données incomplètes
            .map((e: any) => {
                const startDate = moment(`${e.date}T${e.heure_debut}`).toDate();
                const endDate = moment(`${e.date}T${e.heure_fin}`).toDate();
                
                console.log(`Créneau: ${e.cours.nom} - Date: ${e.date} - Début: ${e.heure_debut} - Fin: ${e.heure_fin}`);
                console.log(`Dates converties: Start=${startDate}, End=${endDate}`);
                
                return {
                    id: e.id,
                    title: `[${e.type}] ${e.cours.nom} - ${e.enseignants.nom} (${e.salles.nom})`,
                    start: startDate,
                    end: endDate,
                    resource: { salle: e.salles.nom },
                    type: e.type,
                    enseignant_id: e.enseignants.id,
                    salle_id: e.salles.id
                };
            });
        
        console.log('Events pour le calendrier:', calendarEvents);
        setEvents(calendarEvents);
        
        // Filtrer les données pour le PDF de manière plus stricte
        const filteredData = data.filter((e: any) => 
            e && 
            e.cours && 
            e.cours.nom && 
            e.enseignants && 
            e.enseignants.nom && 
            e.salles && 
            e.salles.nom && 
            e.date && 
            e.heure_debut && 
            e.heure_fin
        );
        setPdfData(filteredData); // Stocker les données filtrées pour le PDF
        console.log('PDF Data filtrée:', filteredData);
    }

    useEffect(() => {
        fetchGroupes()
        fetchEvents()
    }, [selectedGroupe])

    const handleGenerate = async () => {
        if (!confirm("Voulez-vous supprimer le planning actuel et en générer un nouveau ?")) return;

        setLoading(true)
        setMessage('Génération en cours...')

        // Supprimer l'ancien planning
        const { data: existingSessions, error: fetchError } = await supabase
            .from('emplois_du_temps')
            .select('id')
        
        if (fetchError) {
            setMessage("Erreur lors de la récupération de l'ancien planning: " + fetchError.message)
            setLoading(false)
            return
        }

        if (existingSessions && existingSessions.length > 0) {
            const { error: deleteError } = await supabase
                .from('emplois_du_temps')
                .delete()
                .in('id', existingSessions.map(s => s.id))
            
            if (deleteError) {
                setMessage("Erreur lors de la suppression de l'ancien planning: " + deleteError.message)
                setLoading(false)
                return
            }
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
        const calendarEvent = event as CalendarEvent
        const backgroundColor = calendarEvent.type === 'CM' ? '#e74c3c' :
                               calendarEvent.type === 'TD' ? '#9b59b6' :
                               calendarEvent.type === 'TP' ? '#3498db' :
                               '#f39c12'
        return {
            style: {
                backgroundColor,
                color: 'white',
                borderRadius: '4px',
                border: 'none',
                padding: '2px',
                fontSize: '11px',
                fontWeight: 'bold'
            }
        }
    }

    const handleNavigate = (newDate: Date, view: string, action: string) => {
        console.log('Navigation:', { newDate, view, action })
        setCurrentDate(newDate)
    }

    const handleViewChange = (newView: View) => {
        console.log('View change:', newView)
        setCurrentView(newView)
    }

    // Fonction pour exporter en Excel
    const exportToExcel = () => {
        if (pdfData.length === 0) {
            alert('Aucune donnée à exporter')
            return
        }

        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.json_to_sheet(pdfData.map(item => ({
            'Jour': moment(item.date).format('dddd DD/MM/YYYY'),
            'Horaire': `${item.heure_debut.substring(0, 5)} - ${item.heure_fin.substring(0, 5)}`,
            'Type': item.type,
            'Cours': item.cours.nom,
            'Enseignant': item.enseignants.nom,
            'Salle': item.salles.nom,
            'Groupe': item.groupes?.nom || 'Tous'
        })))

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Emploi du Temps')
        
        const selectedGroupeName = selectedGroupe && groupes ? groupes.find(g => g.id === selectedGroupe)?.nom : null
        const fileName = `emploi_du_temps_${selectedGroupeName || 'tous'}_${moment().format('YYYY-MM-DD')}.xlsx`
        
        XLSX.writeFile(workbook, fileName)
    }

    // Fonction pour exporter en HTML (imprimable en PDF)
    const exportToHTML = () => {
        if (pdfData.length === 0) {
            alert('Aucune donnée à exporter')
            return
        }

        // Organiser les données par jour et créneau
        const timeSlots = [
            { start: '08:00', end: '09:30' },
            { start: '09:30', end: '11:00' },
            { start: '11:00', end: '12:30' },
            { start: '13:30', end: '15:00' },
            { start: '15:00', end: '16:30' },
        ]
        
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi']
        
        // Organiser les données
        const organized: any = {}
        days.forEach(day => {
            organized[day] = {}
            timeSlots.forEach(slot => {
                organized[day][`${slot.start}-${slot.end}`] = null
            })
        })

        // Remplir avec les données
        pdfData.forEach(item => {
            const heureDebut = item.heure_debut.substring(0, 5)
            const heureFin = item.heure_fin.substring(0, 5)
            
            const date = new Date(item.date)
            const dayIndex = date.getDay() // 0 = dimanche, 1 = lundi, etc.
            
            let dayName
            // Mapping pour dimanche à jeudi
            if (dayIndex === 0) dayName = 'Dimanche'
            else if (dayIndex === 1) dayName = 'Lundi'
            else if (dayIndex === 2) dayName = 'Mardi'
            else if (dayIndex === 3) dayName = 'Mercredi'
            else if (dayIndex === 4) dayName = 'Jeudi'
            else return // Ignorer vendredi (5) et samedi (6)
            
            timeSlots.forEach(slot => {
                if (slot.start === heureDebut && slot.end === heureFin) {
                    if (organized[dayName] && organized[dayName][`${slot.start}-${slot.end}`] === null) {
                        organized[dayName][`${slot.start}-${slot.end}`] = item
                    }
                }
            })
        })

        // Créer le HTML
        const groupeName = selectedGroupe && groupes ? groupes.find(g => g.id === selectedGroupe)?.nom : null
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Emploi du Temps</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        padding: 20px;
                    }
                    
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }
                    
                    .header { 
                        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                        color: white;
                        text-align: center; 
                        padding: 30px 20px;
                        position: relative;
                    }
                    
                    .header::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
                    }
                    
                    .title { 
                        font-size: 2.5em; 
                        font-weight: 700;
                        margin-bottom: 10px;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        position: relative;
                        z-index: 1;
                    }
                    
                    .subtitle { 
                        font-size: 1.2em; 
                        margin-bottom: 5px;
                        opacity: 0.9;
                        position: relative;
                        z-index: 1;
                    }
                    
                    .date { 
                        font-size: 0.9em; 
                        opacity: 0.8;
                        position: relative;
                        z-index: 1;
                    }
                    
                    .content {
                        padding: 30px;
                    }
                    
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-top: 20px;
                        border-radius: 10px;
                        overflow: hidden;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                    }
                    
                    th, td { 
                        border: 1px solid #e1e8ed; 
                        padding: 15px 10px; 
                        text-align: center; 
                        vertical-align: middle;
                    }
                    
                    th { 
                        background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
                        color: white;
                        font-weight: 600;
                        font-size: 0.9em;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .time-cell { 
                        background: linear-gradient(135deg, #ecf0f1 0%, #bdc3c7 100%);
                        font-weight: 600;
                        color: #2c3e50;
                        font-size: 0.85em;
                    }
                    
                    .course-cell { 
                        background: white;
                        transition: all 0.3s ease;
                    }
                    
                    .course-cell:hover {
                        transform: scale(1.02);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    }
                    
                    .empty-cell { 
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                        color: #6c757d; 
                        font-style: italic;
                        font-size: 0.9em;
                    }
                    
                    .course-type { 
                        font-weight: 700; 
                        margin-bottom: 5px;
                        font-size: 0.9em;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .course-name { 
                        margin-bottom: 3px;
                        font-weight: 500;
                        color: #2c3e50;
                    }
                    
                    .course-teacher { 
                        margin-bottom: 2px;
                        font-size: 0.85em;
                        color: #7f8c8d;
                    }
                    
                    .course-room { 
                        font-size: 0.8em;
                        color: #95a5a6;
                        font-weight: 500;
                    }
                    
                    .legend { 
                        margin-top: 30px; 
                        padding: 25px;
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                        border-radius: 10px;
                        border: 1px solid #dee2e6;
                    }
                    
                    .legend-title { 
                        font-weight: 700; 
                        text-align: center; 
                        margin-bottom: 20px;
                        font-size: 1.1em;
                        color: #2c3e50;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .legend-items { 
                        display: flex; 
                        justify-content: space-around;
                        flex-wrap: wrap;
                        gap: 20px;
                    }
                    
                    .legend-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 15px;
                        border-radius: 8px;
                        font-weight: 500;
                        color: white;
                        min-width: 150px;
                        justify-content: center;
                    }
                    
                    .legend-cm {
                        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                    }
                    
                    .legend-td {
                        background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
                    }
                    
                    .legend-tp {
                        background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
                    }
                    
                    @media print { 
                        body { 
                            background: white;
                            padding: 0;
                        }
                        .container {
                            box-shadow: none;
                            border-radius: 0;
                        }
                        .header {
                            background: #4facfe;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="title">Emploi du Temps</div>
                        ${groupeName ? `<div class="subtitle">Groupe : ${groupeName}</div>` : ''}
                        <div class="date">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
                    </div>
                    
                    <div class="content">
                        <table>
                            <thead>
                                <tr>
                                    <th>Horaire</th>
                                    ${days.map(day => `<th>${day}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${timeSlots.map(slot => `
                                    <tr>
                                        <td class="time-cell">${slot.start}<br>${slot.end}</td>
                                        ${days.map(day => {
                                            const courseData = organized[day][`${slot.start}-${slot.end}`]
                                            if (courseData) {
                                                const bgColor = courseData.type === 'CM' ? 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' :
                                                               courseData.type === 'TD' ? 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)' :
                                                               courseData.type === 'TP' ? 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)' :
                                                               'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)';
                                                return `
                                                    <td class="course-cell" style="background: ${bgColor}; color: white;">
                                                        <div class="course-type">${courseData.type}</div>
                                                        <div class="course-name">${courseData.cours.nom}</div>
                                                        <div class="course-teacher">${courseData.enseignants.nom}</div>
                                                        <div class="course-room">${courseData.salles.nom}</div>
                                                    </td>
                                                `
                                            } else {
                                                return '<td class="empty-cell">Libre</td>'
                                            }
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        
                        <div class="legend">
                            <div class="legend-title">Types de cours</div>
                            <div class="legend-items">
                                <div class="flex items-center gap-2">
                                    <div class="w-4 h-4 bg-red-500 rounded"></div>
                                    <span>CM - Cours Magistral</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="w-4 h-4 bg-purple-500 rounded"></div>
                                    <span>TD - Travaux Dirigés</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="w-4 h-4 bg-blue-500 rounded"></div>
                                    <span>TP - Travaux Pratiques</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `

        // Ouvrir dans une nouvelle fenêtre pour impression
        const newWindow = window.open('', '_blank')
        newWindow?.document.write(html)
        newWindow?.document.close()
        
        // Attendre que le contenu soit chargé puis imprimer
        setTimeout(() => {
            newWindow?.print()
        }, 500)
    }

    const exportToPDF = async () => {
        if (pdfData.length === 0) return

        console.log('=== DEBUG PDF EXPORT ===')
        console.log('PDF Data:', pdfData)

        // Importer jsPDF dynamiquement
        const jsPDF = (await import('jspdf')).default

        const doc = new jsPDF('landscape', 'mm', 'a4')
        
        // Titre
        doc.setFontSize(20)
        doc.text('Emploi du Temps', 140, 20, { align: 'center' })
        
        if (selectedGroupe) {
            const groupe = groupes.find(g => g.id === selectedGroupe)
            if (groupe) {
                doc.setFontSize(14)
                doc.text(`Groupe : ${groupe.nom}`, 140, 30, { align: 'center' })
            }
        }

        // Organiser les données par jour et créneau - Dimanche à Jeudi
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi']
        const timeSlots = [
            { start: '08:00', end: '09:30' },
            { start: '09:30', end: '11:00' },
            { start: '11:00', end: '12:30' },
            { start: '13:30', end: '15:00' },
            { start: '15:00', end: '16:30' }
        ]

        const organized: any = {}
        days.forEach(day => {
            organized[day] = {}
            timeSlots.forEach(slot => {
                organized[day][`${slot.start}-${slot.end}`] = null
            })
        })

        pdfData.forEach((item: any) => {
            const dayIndex = new Date(item.date).getDay()
            // Mapping correct : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi
            let dayName = 'Dimanche'
            if (dayIndex === 0) dayName = 'Dimanche'
            else if (dayIndex === 1) dayName = 'Lundi'
            else if (dayIndex === 2) dayName = 'Mardi'
            else if (dayIndex === 3) dayName = 'Mercredi'
            else if (dayIndex === 4) dayName = 'Jeudi'
            else return // Ignorer vendredi (5) et samedi (6)
            
            const timeKey = `${item.heure_debut.substring(0, 5)}-${item.heure_fin.substring(0, 5)}`
            
            console.log(`Item: ${item.date} -> dayIndex: ${dayIndex} -> dayName: ${dayName}, timeKey: ${timeKey}`)
            
            if (organized[dayName] && organized[dayName][timeKey] === null) {
                organized[dayName][timeKey] = item
                console.log(`✅ Ajouté: ${dayName} ${timeKey}`)
            } else {
                console.log(`❌ Non ajouté: ${dayName} ${timeKey} (déjà occupé ou invalide)`)
            }
        })

        console.log('Organized data:', organized)

        // Couleurs pour les types de cours
        const colors = {
            'CM': [231, 76, 60],   // Rouge
            'TD': [155, 89, 182],     // Violet
            'TP': [52, 152, 219]      // Bleu
        }

        // Position de départ du tableau
        let y = 50
        const cellHeight = 35
        const cellWidth = 50
        const startX = 15

        // En-têtes des jours
        doc.setFontSize(12)
        doc.setFont('bold')
        days.forEach((day, index) => {
            doc.text(day, startX + (index + 1) * cellWidth + cellWidth/2, y, { align: 'center' })
        })

        // En-têtes des horaires
        doc.text('Horaire', startX + cellWidth/2, y, { align: 'center' })

        y += 15

        // Contenu du tableau
        timeSlots.forEach(slot => {
            // Horaire
            doc.setFontSize(10)
            doc.setFont('normal')
            doc.text(`${slot.start}\n${slot.end}`, startX + cellWidth/2, y + 12, { align: 'center' })

            // Cours pour chaque jour
            days.forEach((day, dayIndex) => {
                const courseData = organized[day][`${slot.start}-${slot.end}`]
                const x = startX + (dayIndex + 1) * cellWidth
                
                if (courseData) {
                    const bgColor = colors[courseData.type as keyof typeof colors] || [128, 128, 128]
                    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2])
                    doc.rect(x, y, cellWidth, cellHeight, 'F')
                    
                    // Texte en blanc centré
                    doc.setTextColor(255, 255, 255)
                    doc.setFontSize(8)
                    doc.text(courseData.type || 'N/A', x + cellWidth/2, y + 5, { align: 'center' })
                    doc.text((courseData.cours?.nom || 'N/A').substring(0, 15), x + cellWidth/2, y + 12, { align: 'center' })
                    doc.text((courseData.enseignants?.nom || 'N/A').substring(0, 15), x + cellWidth/2, y + 19, { align: 'center' })
                    doc.text((courseData.salles?.nom || 'N/A').substring(0, 15), x + cellWidth/2, y + 26, { align: 'center' })
                    doc.setTextColor(0, 0, 0)
                } else {
                    // Case vide
                    doc.rect(x, y, cellWidth, cellHeight, 'S')
                    doc.text('Libre', x + cellWidth/2, y + 17, { align: 'center' })
                }
            })

            y += cellHeight
        })

        // Légende
        y += 10
        doc.setFontSize(12)
        doc.setFont('bold')
        doc.text('Types de cours :', startX, y)
        
        y += 8
        doc.setFontSize(10)
        doc.setFont('normal')
        
        Object.entries(colors).forEach(([type, color], index) => {
            const x = startX + index * 60
            if (color && Array.isArray(color) && color.length >= 3) {
                doc.setFillColor(color[0], color[1], color[2])
                doc.rect(x, y, 15, 8, 'F')
                doc.setTextColor(0, 0, 0)
                doc.text(`${type}`, x + 20, y + 6)
            }
        })

        // Sauvegarder le PDF
        const filename = selectedGroupe ? 
            `emploi_du_temps_${groupes.find(g => g.id === selectedGroupe)?.nom}.pdf` : 
            'emploi_du_temps.pdf'
        doc.save(filename)
    }

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
                            {groupe.nom} {groupe.niveau && `(${groupe.niveau})`} {groupe.specialite && `(${groupe.specialite})`}
                        </option>
                    ))}
                </select>

                {/* Export Excel */}
                {pdfData.length > 0 && (
                  <button
                    onClick={exportToExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    📊 Exporter Excel
                  </button>
                )}

                {/* Export HTML */}
                {pdfData.length > 0 && (
                  <button
                    onClick={exportToHTML}
                    className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                  >
                    📄 Export HTML (Imprimable en PDF)
                  </button>
                )}

                {/* Export PDF avec jsPDF */}
                {pdfData.length > 0 && (
                  <button
                    onClick={exportToPDF}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                  >
                    📄 Export PDF
                  </button>
                )}
            </div>

            {message && <p className="text-sm text-gray-700 mb-4">{message}</p>}

            {/* Légende des types de cours */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Types de cours :</h3>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-500 rounded"></div>
                        <span>CM - Cours Magistral</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-purple-500 rounded"></div>
                        <span>TD - Travaux Dirigés</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-500 rounded"></div>
                        <span>TP - Travaux Pratiques</span>
                    </div>
                </div>
            </div>

            <DnDCalendar
                localizer={localizer}
                events={events}
                onEventDrop={onEventDrop}
                onDoubleClickEvent={handleDoubleClickEvent}
                eventPropGetter={eventStyleGetter}
                onNavigate={handleNavigate}
                onView={handleViewChange}
                date={currentDate}
                view={currentView}
                resizable
                startAccessor={(event) => (event as CalendarEvent).start}
                endAccessor={(event) => (event as CalendarEvent).end}
                style={{ height: 600 }}
                defaultView="week"
                views={['day', 'week', 'month']}
                min={new Date(1970, 1, 1, 8, 0)}
                max={new Date(1970, 1, 1, 18, 0)}
                step={30}
                timeslots={2}
                formats={{
                    dayHeaderFormat: (date: Date) => moment(date).format('dddd DD/MM'),
                    dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) => 
                        `${moment(start).format('DD/MM')} - ${moment(end).format('DD/MM')}`,
                    timeGutterFormat: (date: Date) => moment(date).format('HH:mm'),
                }}
                messages={{
                    today: "Aujourd'hui",
                    previous: 'Précédent',
                    next: 'Suivant',
                    month: 'Mois',
                    week: 'Semaine',
                    day: 'Jour',
                    agenda: 'Agenda',
                    noEventsInRange: 'Aucun cours prévu dans cette période.',
                    allDay: 'Toute la journée',
                    yesterday: 'Hier',
                    tomorrow: 'Demain',
                    showMore: (total: number) => `+${total} autres`,
                }}
                components={{
                    event: (props: any) => (
                        <div style={{ 
                            padding: '2px 4px', 
                            fontSize: '10px',
                            lineHeight: '1.2',
                            overflow: 'hidden'
                        }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '1px' }}>
                                {props.title.split(' - ')[0]}
                            </div>
                            <div style={{ fontSize: '9px', opacity: 0.9 }}>
                                {props.title.split(' - ')[1]}
                            </div>
                        </div>
                    )
                }}
            />
        </div>
    )
}