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
import Header from '@/src/components/Header'

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
    filiere_nom?: string;
    section_nom?: string;
};

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

interface Filiere { id: string; nom: string; }
interface Section { id: string; nom: string; }
interface Groupe { id: string; nom: string; }

export default function EmploiDuTempsPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [pdfData, setPdfData] = useState<any[]>([])

    // State pour les filtres
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])
    const [selectedFiliere, setSelectedFiliere] = useState<string>('')
    const [selectedSection, setSelectedSection] = useState<string>('')
    const [selectedGroupe, setSelectedGroupe] = useState<string>('')

    const [currentDate, setCurrentDate] = useState(new Date())
    const [currentView, setCurrentView] = useState<View>('week')

    const localizer = momentLocalizer(moment)

    // --- Logique de récupération des données pour les filtres ---
    useEffect(() => {
        const fetchFilieres = async () => {
            const { data, error } = await supabase.from('filieres').select('id, nom').order('nom');
            if (error) console.error("Erreur chargement filières:", error.message);
            else setFilieres(data || []);
        };
        fetchFilieres();
    }, []);

    useEffect(() => {
        const fetchSections = async () => {
            if (!selectedFiliere) {
                setSections([]);
                setGroupes([]);
                return;
            }
            const { data, error } = await supabase.from('sections').select('id, nom').eq('filiere_id', selectedFiliere).order('nom');
            if (error) console.error("Erreur chargement sections:", error.message);
            else setSections(data || []);
        };
        fetchSections();
        setSelectedSection('');
        setSelectedGroupe('');
    }, [selectedFiliere]);

    useEffect(() => {
    const fetchGroupes = async () => {
            if (!selectedSection) {
                setGroupes([]);
                return;
            }
            const { data, error } = await supabase.from('groupes').select('id, nom').eq('section_id', selectedSection).order('nom');
            if (error) console.error("Erreur chargement groupes:", error.message);
            else setGroupes(data || []);
        };
        fetchGroupes();
        setSelectedGroupe('');
    }, [selectedSection]);


    const fetchEvents = async () => {
        let query = supabase
            .from('emplois_du_temps')
            .select(`
                id, date, heure_debut, heure_fin, type,
                cours:cours_id ( nom, groupe_id, groupes (id, nom, section_id, sections (id, nom, filiere_id, filieres(id, nom))) ),
                salles:salle_id ( id, nom ),
                enseignants:enseignant_id ( id, nom )
            `)

        if (selectedGroupe) {
            query = query.eq('cours.groupe_id', selectedGroupe)
        } else if (selectedSection) {
            query = query.eq('cours.groupes.section_id', selectedSection)
        } else {
             setEvents([])
             setPdfData([])
             return
        }

        const { data, error } = await query

        if (error) {
            setMessage('Erreur chargement des événements: ' + error.message)
            return
        }

        const calendarEvents = data
            .filter((e: any) => e.cours && e.cours.nom && e.enseignants && e.salles)
            .map((e: any) => {
                const startDate = moment(`${e.date}T${e.heure_debut}`).toDate();
                const endDate = moment(`${e.date}T${e.heure_fin}`).toDate();
                
                return {
                    id: e.id,
                    title: `[${e.type}] ${e.cours.nom} - ${e.enseignants.nom} (${e.salles.nom})`,
                    start: startDate,
                    end: endDate,
                    resource: { salle: e.salles.nom },
                    type: e.type,
                    enseignant_id: e.enseignants.id,
                    salle_id: e.salles.id,
                    filiere_nom: e.cours.groupes?.sections?.filieres?.nom,
                    section_nom: e.cours.groupes?.sections?.nom,
                };
            });
        
        setEvents(calendarEvents);
        
        const filteredData = data.filter((e: any) => 
            e && e.cours && e.cours.nom && e.enseignants && e.enseignants.nom && 
            e.salles && e.salles.nom && e.date && e.heure_debut && e.heure_fin
        );
        setPdfData(filteredData);
    }

    useEffect(() => {
        fetchEvents()
    }, [selectedGroupe, selectedSection, selectedFiliere])

    const handleGenerate = async () => {
        if (!selectedSection) {
            alert("Veuillez sélectionner une filière et une section pour la génération.")
            return
        }
        if (!confirm(`Voulez-vous supprimer le planning de la section sélectionnée et en générer un nouveau ?`)) return;

        setLoading(true)
        setMessage('Génération en cours...')

        const { data: coursInSection, error: coursError } = await supabase
            .from('cours')
            .select('id, groupes!inner(section_id)')
            .eq('groupes.section_id', selectedSection);
        
        if (coursError || !coursInSection) {
            setMessage(`Erreur lors de la récupération des cours de la section: ${coursError?.message}`);
            setLoading(false);
            return;
        }

        if (coursInSection.length > 0) {
            const coursIdsToDelete = coursInSection.map(c => c.id);
            const { error: deleteError } = await supabase
                .from('emplois_du_temps')
                .delete()
                .in('cours_id', coursIdsToDelete);
            
            if (deleteError) {
                setMessage(`Erreur lors de la suppression de l'ancien planning: ${deleteError.message}`);
                setLoading(false);
                return;
            }
        }

        const sessions = await genererEmploiDuTemps(setMessage, selectedSection)

        if (sessions.length === 0) {
            // setMessage reste tel quel depuis genererEmploiDuTemps
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
            setMessage(`Erreur lors de l'insertion du nouveau planning: ${insertError.message}`)
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
        setCurrentDate(newDate)
    }

    const getFileName = () => {
        const filiere = filieres.find(f => f.id === selectedFiliere);
        const section = sections.find(s => s.id === selectedSection);
        const groupe = groupes.find(g => g.id === selectedGroupe);
        
        if (filiere && section) {
            return `Emploi_du_temps_${filiere.nom}_${section.nom}${groupe ? `_${groupe.nom}` : ''}`;
        }
        return 'emploi_du_temps';
    }

    const exportToExcel = () => {
        const fileName = `${getFileName()}.xlsx`;
        const worksheetData = pdfData.map((e: any) => ({
            'Date': moment(e.date).format('DD/MM/YYYY'),
            'Début': e.heure_debut,
            'Fin': e.heure_fin,
            'Type': e.type,
            'Cours': e.cours.nom,
            'Enseignant': e.enseignants.nom,
            'Salle': e.salles.nom,
        }));
        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Emploi du temps');
        XLSX.writeFile(workbook, fileName);
    }
    
    const exportToHTML = () => {
        const fileName = `${getFileName()}.html`;
        
        // Configuration de la grille
        const TIME_SLOTS = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
        const TIME_SLOT_LABELS = ["08:00-09:30", "09:30-11:00", "11:00-12:30", "13:30-15:00", "15:00-16:30", "16:30-18:00"];
        const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
        
        // Organiser les données
        const grid: any[][] = Array(DAYS.length).fill(null).map(() => Array(TIME_SLOTS.length).fill(null).map(() => []));
        const weekStart = moment(currentDate).startOf('week');

        pdfData.forEach((event: any) => {
            const eventDay = moment(event.date).day(); // 0 = dimanche, 1 = lundi, etc.
            const eventStartHour = event.heure_debut.substring(0, 5);
            const timeSlotIndex = TIME_SLOTS.indexOf(eventStartHour);

            if (eventDay >= 0 && eventDay < DAYS.length && timeSlotIndex !== -1) {
                grid[eventDay][timeSlotIndex].push(event);
            }
        });

        const filiere = filieres.find(f => f.id === selectedFiliere);
        const section = sections.find(s => s.id === selectedSection);
        const groupe = groupes.find(g => g.id === selectedGroupe);
        
        const html = `
            <!DOCTYPE html>
        <html lang="fr">
            <head>
                <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Emploi du Temps</title>
                <style>
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    margin: 0;
                        padding: 20px;
                    background-color: #f5f5f5;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }
                    .header { 
                    background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%);
                        color: white;
                    padding: 20px;
                        text-align: center; 
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                }
                .header h2 {
                    margin: 10px 0 0 0;
                    font-size: 16px;
                    font-weight: normal;
                        opacity: 0.9;
                }
                .timetable {
                        width: 100%; 
                        border-collapse: collapse; 
                    margin: 20px 0;
                }
                .timetable th {
                    background: #ecf0f1;
                    color: #2c3e50;
                    padding: 12px 8px;
                        text-align: center; 
                    font-weight: bold;
                    border: 1px solid #bdc3c7;
                    font-size: 12px;
                }
                .timetable td {
                    border: 1px solid #bdc3c7;
                    padding: 8px;
                    text-align: center;
                    vertical-align: top;
                    height: 80px;
                    font-size: 11px;
                }
                    .time-cell { 
                    background: #f8f9fa;
                    font-weight: bold;
                        color: #2c3e50;
                    width: 80px;
                    }
                    .course-cell { 
                    padding: 4px;
                    border-radius: 4px;
                    color: white;
                    font-weight: bold;
                    text-align: left;
                }
                    .course-type { 
                    font-size: 10px;
                    margin-bottom: 2px;
                    text-align: center;
                }
                    .course-name { 
                    font-size: 10px;
                    margin-bottom: 2px;
                    font-weight: bold;
                }
                    .course-teacher { 
                    font-size: 9px;
                        margin-bottom: 2px;
                    }
                    .course-room { 
                    font-size: 9px;
                    font-weight: bold;
                }
                .empty-cell {
                    background: #f8f9fa;
                        color: #95a5a6;
                    font-style: italic;
                    }
                    .legend { 
                    background: #f8f9fa;
                    padding: 15px;
                    border-top: 1px solid #bdc3c7;
                }
                .legend h3 {
                    margin: 0 0 10px 0;
                        color: #2c3e50;
                    font-size: 14px;
                    }
                    .legend-items { 
                        display: flex; 
                    gap: 30px;
                        flex-wrap: wrap;
                    }
                    .legend-item {
                        display: flex;
                        align-items: center;
                    gap: 8px;
                    font-size: 12px;
                }
                .legend-color {
                    width: 16px;
                    height: 12px;
                    border-radius: 2px;
                }
                .footer {
                    text-align: center;
                    padding: 15px;
                    color: #7f8c8d;
                    font-size: 11px;
                    border-top: 1px solid #bdc3c7;
                }
                    @media print { 
                    body { margin: 0; padding: 0; background: white; }
                    .container { box-shadow: none; border-radius: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                    <h1>EMPLOI DU TEMPS</h1>
                    <h2>${filiere ? filiere.nom : ''} - ${section ? section.nom : ''}${groupe ? ` - ${groupe.nom}` : ''}</h2>
                    </div>
                    
                <table class="timetable">
                            <thead>
                                <tr>
                                    <th>Horaire</th>
                            ${DAYS.map(day => {
                                const date = weekStart.clone().add(DAYS.indexOf(day), 'days').format('DD/MM');
                                return `<th>${day}<br><small>${date}</small></th>`;
                            }).join('')}
                                </tr>
                            </thead>
                            <tbody>
                        ${TIME_SLOT_LABELS.map((slot, timeIndex) => {
                            const gridTimeIndex = timeIndex;
                            return `
                                <tr>
                                    <td class="time-cell">${slot}</td>
                                    ${DAYS.map((day, dayIndex) => {
                                        const cellEvents = grid[dayIndex] ? grid[dayIndex][gridTimeIndex] : [];
                                        if (cellEvents && cellEvents.length > 0) {
                                            const event = cellEvents[0];
                                            const bgColor = event.type === 'CM' ? '#e74c3c' :
                                                           event.type === 'TD' ? '#e67e22' :
                                                           event.type === 'TP' ? '#3498db' : '#27ae60';
                                                return `
                                                <td>
                                                    <div class="course-cell" style="background: ${bgColor};">
                                                        <div class="course-type">${event.type}</div>
                                                        <div class="course-name">${event.cours?.nom || ''}</div>
                                                        <div class="course-teacher">${event.enseignants?.nom || ''}</div>
                                                        <div class="course-room">${event.salles?.nom || ''}</div>
                                                    </div>
                                                    </td>
                                            `;
                                            } else {
                                            return '<td class="empty-cell">Libre</td>';
                                            }
                                        }).join('')}
                                    </tr>
                            `;
                        }).join('')}
                            </tbody>
                        </table>
                        
                        <div class="legend">
                    <h3>Légende :</h3>
                            <div class="legend-items">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #e74c3c;"></div>
                                    <span>CM - Cours Magistral</span>
                                </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #e67e22;"></div>
                                    <span>TD - Travaux Dirigés</span>
                                </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #3498db;"></div>
                                    <span>TP - Travaux Pratiques</span>
                                </div>
                            </div>
                        </div>
                
                <div class="footer">
                    Généré le ${moment().format('DD/MM/YYYY à HH:mm')}
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([html], { type: 'text/html' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    }

    const exportToPDF = async () => {
        const fileName = `${getFileName()}.pdf`;
        const { default: jsPDF } = await import('jspdf');
        
        const doc = new jsPDF('landscape', 'mm', 'a4');
        
        // Couleurs professionnelles
        const colors = {
            primary: [52, 73, 94],      // Gris foncé
            secondary: [149, 165, 166],  // Gris clair
            accent: [41, 128, 185],      // Bleu professionnel
            success: [39, 174, 96],      // Vert
            warning: [230, 126, 34],     // Orange
            danger: [231, 76, 60],       // Rouge
            light: [236, 240, 241]       // Gris très clair
        };

        // En-tête
        doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.rect(0, 0, 297, 25, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('bold');
        doc.text('EMPLOI DU TEMPS', 148, 15, { align: 'center' });
        
        const filiere = filieres.find(f => f.id === selectedFiliere);
        const section = sections.find(s => s.id === selectedSection);
        const groupe = groupes.find(g => g.id === selectedGroupe);
        
        if (filiere && section) {
            doc.setFontSize(12);
            doc.setFont('normal');
            doc.text(`${filiere.nom} - ${section.nom}${groupe ? ` - ${groupe.nom}` : ''}`, 148, 25, { align: 'center' });
        }

        // Configuration de la grille
        const TIME_SLOTS = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
        const TIME_SLOT_LABELS = ["08:00-09:30", "09:30-11:00", "11:00-12:30", "13:30-15:00", "15:00-16:30", "16:30-18:00"];
        const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
        
        // Organiser les données
        const grid: any[][] = Array(DAYS.length).fill(null).map(() => Array(TIME_SLOTS.length).fill(null).map(() => []));
        const weekStart = moment(currentDate).startOf('week');

        pdfData.forEach((event: any) => {
            const eventDay = moment(event.date).day(); // 0 = dimanche, 1 = lundi, etc.
            const eventStartHour = event.heure_debut.substring(0, 5);
            const timeSlotIndex = TIME_SLOTS.indexOf(eventStartHour);

            if (eventDay >= 0 && eventDay < DAYS.length && timeSlotIndex !== -1) {
                grid[eventDay][timeSlotIndex].push(event);
            }
        });

        // Position de départ
        let y = 40;
        const cellHeight = 28;
        const cellWidth = 45;
        const timeColWidth = 30;
        
        // Centrer le tableau
        const totalWidth = timeColWidth + DAYS.length * cellWidth;
        const startX = (297 - totalWidth) / 2; // 297mm est la largeur d'une page A4 en paysage

        // En-têtes des jours
        doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.rect(startX, y, timeColWidth + DAYS.length * cellWidth, 15, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('bold');
        
        // Colonne des horaires
        doc.text('Horaire', startX + timeColWidth/2, y + 10, { align: 'center' });
        
        // Jours avec dates
        DAYS.forEach((day, index) => {
            const date = weekStart.clone().add(index, 'days').format('DD/MM');
            const x = startX + timeColWidth + index * cellWidth;
            doc.text(day, x + cellWidth/2, y + 6, { align: 'center' });
            doc.setFontSize(8);
            doc.setFont('normal');
            doc.text(date, x + cellWidth/2, y + 11, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont('bold');
        });

        y += 15;

        // Contenu du tableau
        TIME_SLOT_LABELS.forEach((slot, timeIndex) => {
            const gridTimeIndex = timeIndex;

            // Horaire
            doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
            doc.rect(startX, y, timeColWidth, cellHeight, 'F');
            doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
            doc.setFontSize(8);
            doc.setFont('bold');
            doc.text(slot, startX + timeColWidth/2, y + 18, { align: 'center' });

            // Cours pour chaque jour
            DAYS.forEach((day, dayIndex) => {
                const cellEvents = grid[dayIndex] ? grid[dayIndex][gridTimeIndex] : [];
                const x = startX + timeColWidth + dayIndex * cellWidth;
                
                if (cellEvents && cellEvents.length > 0) {
                    const event = cellEvents[0];
                    
                    // Couleurs selon le type
                    let bgColor;
                    switch(event.type) {
                        case 'CM': bgColor = colors.danger; break;
                        case 'TD': bgColor = colors.warning; break;
                        case 'TP': bgColor = colors.accent; break;
                        default: bgColor = colors.success;
                    }
                    
                    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
                    doc.rect(x, y, cellWidth, cellHeight, 'F');
                    
                    // Texte en blanc
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(7);
                    doc.setFont('bold');
                    doc.text(event.type, x + 3, y + 6);
                    doc.setFont('normal');
                    doc.text((event.cours?.nom || '').substring(0, 18), x + 3, y + 12);
                    doc.text((event.enseignants?.nom || '').substring(0, 18), x + 3, y + 18);
                    doc.text((event.salles?.nom || '').substring(0, 18), x + 3, y + 24);
                } else {
                    // Case vide
                    doc.setFillColor(255, 255, 255);
                    doc.rect(x, y, cellWidth, cellHeight, 'F');
                    doc.rect(x, y, cellWidth, cellHeight, 'S');
                    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
                    doc.setFontSize(7);
                    doc.text('Libre', x + cellWidth/2, y + 14, { align: 'center' });
                }
            });

            y += cellHeight;
        });

        // Légende
        y += 10;
        doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
        doc.rect(startX, y, timeColWidth + DAYS.length * cellWidth, 15, 'F');
        
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.setFontSize(8);
        doc.setFont('bold');
        doc.text('Légende :', startX + 5, y + 6);
        
        const legendItems = [
            { type: 'CM', color: colors.danger, name: 'Cours Magistral' },
            { type: 'TD', color: colors.warning, name: 'Travaux Dirigés' },
            { type: 'TP', color: colors.accent, name: 'Travaux Pratiques' }
        ];
        
        legendItems.forEach((item, index) => {
            const x = startX + 25 + index * 70;
            doc.setFillColor(item.color[0], item.color[1], item.color[2]);
            doc.rect(x, y + 2, 8, 6, 'F');
            doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
            doc.setFontSize(7);
            doc.setFont('normal');
            doc.text(`${item.type} - ${item.name}`, x + 12, y + 6);
        });

        // Pied de page
        doc.setFontSize(7);
        doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.text(`Généré le ${moment().format('DD/MM/YYYY à HH:mm')}`, 148, y + 12, { align: 'center' });

        doc.save(fileName);
    }


    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <Header />

            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold text-gray-800 mb-6 text-center">Emploi du Temps</h1>

                <div className="flex justify-between items-center mb-4 p-4 bg-gray-100 rounded-lg shadow">
                    <div className="flex items-center gap-4">
                        <select value={selectedFiliere} onChange={(e) => setSelectedFiliere(e.target.value)} className="border p-2 rounded">
                            <option value="">Sélectionnez une filière</option>
                            {filieres.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                        </select>
                        <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="border p-2 rounded" disabled={!selectedFiliere}>
                            <option value="">Sélectionnez une section</option>
                            {sections.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                        <select value={selectedGroupe} onChange={(e) => setSelectedGroupe(e.target.value)} className="border p-2 rounded" disabled={!selectedSection}>
                    <option value="">Tous les groupes</option>
                            {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                </select>
                    </div>

                    <div className="flex items-center gap-4">
                  <button
                            onClick={handleGenerate}
                            disabled={loading || !selectedSection}
                            className="bg-purple-600 text-white font-bold px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-400"
                  >
                            {loading ? 'Génération...' : 'Générer Planning'}
                  </button>
                        <div className="flex gap-2">
                            <button onClick={exportToExcel} disabled={!selectedSection} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">Excel</button>
                            <button onClick={exportToPDF} disabled={!selectedSection} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400">PDF</button>
                            <button onClick={exportToHTML} disabled={!selectedSection} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400">HTML</button>
            </div>
                </div>
            </div>

                {message && <p className="mb-4 text-center font-semibold">{message}</p>}

                <div className="bg-white p-4 rounded-lg shadow" style={{ height: '75vh' }}>
            <DnDCalendar
                localizer={localizer}
                events={events}
                onEventDrop={onEventDrop}
                onDoubleClickEvent={handleDoubleClickEvent}
                        startAccessor={(event: CalendarEvent) => event.start}
                        endAccessor={(event: CalendarEvent) => event.end}
                resizable
                        draggableAccessor={() => true}
                        views={['month', 'week', 'day']}
                        view={currentView}
                        onView={view => setCurrentView(view)}
                        date={currentDate}
                onNavigate={handleNavigate}
                messages={{
                            next: "Suivant",
                            previous: "Précédent",
                    today: "Aujourd'hui",
                            month: "Mois",
                            week: "Semaine",
                            day: "Jour"
                        }}
                        eventPropGetter={eventStyleGetter}
                        min={new Date(0, 0, 0, 8, 0, 0)}
                        max={new Date(0, 0, 0, 19, 0, 0)}
                    />
                            </div>
                            </div>
                        </div>
    );
}