'use client'
import React, { useState, useEffect } from 'react';
import moment from 'moment';
import 'moment/locale/fr';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { DraggableProvided, DroppableProvided } from '@hello-pangea/dnd';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

type EventData = {
    id: string;
    date: string;
    heure_debut: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
};

interface TimetableGridProps {
    events: EventData[];
    currentDate: Date;
    sectionName?: string;
    niveau?: string;
    dateDebut?: string;
    dateFin?: string;
}

const TIME_SLOTS = [ "08:00", "09:30", "11:00", "13:30", "15:00", "16:30" ];
const TIME_SLOT_LABELS = [ "08:00 - 09:30", "09:30 - 11:00", "11:00 - 12:30", "12:30 - 13:30", "13:30 - 15:00", "15:00 - 16:30", "16:30 - 18:00" ];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const typeColorMap: { [key: string]: string } = {
    'CM': 'bg-red-100 border-l-4 border-red-500',
    'TD': 'bg-purple-100 border-l-4 border-purple-500',
    'TP': 'bg-blue-100 border-l-4 border-blue-500',
    'Cours': 'bg-yellow-100 border-l-4 border-yellow-500',
};

const TimetableGrid: React.FC<TimetableGridProps> = ({ events: initialEvents, currentDate, sectionName, niveau, dateDebut, dateFin }) => {
    // Ajoute une séance de test si events est vide
    const testEvent = {
        id: "1",
        date: "2025-06-26",
        heure_debut: "09:30:00",
        type: "Cours magistral",
        cours: { nom: "Maths" },
        enseignants: { nom: "Mme Dupont" },
        salles: { nom: "Salle 101" }
    };
    const [events, setEvents] = useState(initialEvents.length > 0 ? initialEvents : [testEvent]);
    const tableRef = React.useRef<HTMLDivElement>(null);
    
    const grid: (EventData[])[][] = Array(DAYS.length).fill(null).map(() => Array(TIME_SLOTS.length).fill(null).map(() => []));
    const weekStart = moment(currentDate).startOf('isoWeek');

    events.forEach(event => {
        const eventDay = moment(event.date).isoWeekday() - 1;
        const eventStartHour = event.heure_debut.substring(0, 5);
        const timeSlotIndex = TIME_SLOTS.indexOf(eventStartHour);

        if (eventDay >= 0 && eventDay < DAYS.length && timeSlotIndex !== -1) {
            grid[eventDay][timeSlotIndex].push(event);
        }
    });

    const handleDragEnd = (result: DropResult) => {
        console.log('Drag result:', result);
        if (!result.destination) return;
        const eventId = result.draggableId;
        const [newDayIndex, newGridIndex] = result.destination.droppableId.split('-').map(Number);
        setEvents(prevEvents =>
            prevEvents.map(event =>
                String(event.id) === eventId
                    ? {
                        ...event,
                        date: moment(currentDate).startOf('isoWeek').add(newDayIndex, 'days').format('YYYY-MM-DD'),
                        heure_debut: TIME_SLOTS[newGridIndex],
                    }
                    : event
            )
        );
    };

    const exportPDF = async () => {
        console.log('Export PDF called');
        console.log('events used for PDF:', events);
        const pdf = new jsPDF({ orientation: 'landscape' });
        // Ajoute un logo (si disponible)
        try {
            // Remplace le chemin par le tien si besoin
            const logoUrl = '/logo.png';
            const img = new window.Image();
            img.src = logoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            pdf.addImage(img, 'PNG', 10, 8, 28, 28); // x, y, width, height
        } catch (e) {
            // Si le logo n'est pas trouvé, laisse un espace
            pdf.setDrawColor(200);
            pdf.rect(10, 8, 28, 28);
        }
        pdf.setFontSize(18);
        pdf.text('Emploi du temps', 45, 18);
        pdf.setFontSize(12);
        pdf.text(`Section : ${sectionName || '...'}`, 45, 28);
        pdf.text(`Niveau : ${niveau || '...'}`, 45, 36);
        pdf.text(`Période : ${dateDebut || '...'} au ${dateFin || '...'}`, 45, 44);
        pdf.setLineWidth(0.5);
        pdf.line(10, 48, pdf.internal.pageSize.getWidth() - 10, 48);

        // Filtrer les events de la semaine affichée
        const weekStart = moment(currentDate).startOf('isoWeek');
        const weekEnd = weekStart.clone().add(6, 'days');
        const filteredEvents = events.filter(ev => {
            const date = moment(ev.date);
            return date.isSameOrAfter(weekStart, 'day') && date.isSameOrBefore(weekEnd, 'day');
        });
        console.log('filteredEvents for PDF:', filteredEvents);

        // Prépare la matrice [créneau][jour]
        const jours = DAYS;
        const creneaux = TIME_SLOT_LABELS.filter(slot => !slot.includes('12:30'));
        const grid = creneaux.map((slot, creneauIdx) =>
            jours.map((day, dayIdx) => {
                const event = filteredEvents.find(ev => {
                    const eventDayName = moment(ev.date).format('dddd').toLowerCase();
                    const eventStartHour = moment(ev.heure_debut, 'HH:mm:ss').format('HH:mm');
                    const slotHour = TIME_SLOTS[creneauIdx];
                    return eventDayName === day.toLowerCase() && slotHour === eventStartHour;
                });
                if (event) {
                    return [
                        event.cours?.nom || '',
                        event.enseignants?.nom || '',
                        event.salles?.nom || '',
                        `[${event.type}]`
                    ].filter(Boolean).join("\n");
                }
                return '';
            })
        );
        console.log('DAYS:', DAYS);
        console.log('TIME_SLOT_LABELS:', TIME_SLOT_LABELS);
        console.log('TIME_SLOTS:', TIME_SLOTS);
        // En-tête du tableau : Heure + jours
        const head = [['Heure', ...jours]];
        const body = [];
        for (let i = 0; i < TIME_SLOT_LABELS.length; i++) {
            if (TIME_SLOT_LABELS[i] === "12:30 - 13:30") {
                body.push([
                    TIME_SLOT_LABELS[i],
                    ...Array(DAYS.length).fill("PAUSE DÉJEUNER")
                ]);
            } else if (grid[body.length]) {
                body.push([TIME_SLOT_LABELS[i], ...grid[body.length]]);
            }
        }
        console.log('head for PDF:', head);
        console.log('body for PDF:', JSON.stringify(body, null, 2));
        autoTable(pdf, {
            head,
            body,
            startY: 52,
            styles: { fontSize: 14, cellPadding: 6, valign: 'middle', halign: 'center', minCellHeight: 18 },
            headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: 20 },
            alternateRowStyles: { fillColor: [240, 240, 255] },
            margin: { left: 10, right: 10 },
            theme: 'grid',
            didDrawCell: (data) => {
                if (data.section === 'body' && data.cell.raw && data.cell.raw !== '') {
                    pdf.setFillColor(232, 240, 254);
                    pdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                }
            }
        });
        pdf.save('emploi-du-temps.pdf');
    };

    return (
        <>
        <style>{`
          .pdf-export, .pdf-export * {
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            border-color: #000 !important;
            filter: none !important;
          }
        `}</style>
        <button
            onClick={exportPDF}
            className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
            Exporter en PDF
        </button>
        <DragDropContext onDragEnd={handleDragEnd}>
        <div ref={tableRef} className="overflow-x-auto shadow-md rounded-lg bg-white">
            <table className="min-w-full border-collapse">
                <thead>
                    <tr className="bg-gray-200">
                        <th className="py-3 px-2 border text-center text-sm font-bold text-gray-600 uppercase">Heure</th>
                        {DAYS.map(day => (
                            <th key={day} className="py-3 px-2 border text-center text-sm font-bold text-gray-600 uppercase w-1/6">
                                {day} <br/>
                                <span className="font-normal text-xs">{weekStart.clone().add(DAYS.indexOf(day), 'days').format('DD/MM')}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {TIME_SLOT_LABELS.map((slot, timeIndex) => {
                         if (slot === '12:30 - 13:30') {
                            return (
                                <tr key={slot}>
                                    <td className="py-3 px-2 border font-semibold text-center bg-gray-100">{slot}</td>
                                    <td colSpan={DAYS.length} className="py-3 px-2 border text-center bg-gray-50 text-gray-400 font-semibold">PAUSE DÉJEUNER</td>
                                </tr>
                            )
                        }
                        const gridIndex = slot.includes('13:30') ? timeIndex - 1 : timeIndex;

                        return (
                            <tr key={slot}>
                                <td className="py-3 px-2 border font-semibold text-center bg-gray-100">{slot}</td>
                                {DAYS.map((day, dayIndex) => {
                                    const cellEvents = (grid[dayIndex] && grid[dayIndex][gridIndex]) ? grid[dayIndex][gridIndex] : [];
                                    const droppableId = `${dayIndex}-${gridIndex}`;
                                    return (
                                        <td key={`${day}-${slot}`} className="py-2 px-1 border align-top h-28">
                                            <Droppable droppableId={droppableId}>
                                            {(provided: DroppableProvided) => (
                                                <div ref={provided.innerRef} {...provided.droppableProps} className="h-full">
                                                {Array.isArray(cellEvents) && cellEvents.length > 0 && (
                                                    <div className="space-y-1">
                                                    {cellEvents.map((event, idx) => (
                                                        <Draggable draggableId={String(event.id)} index={idx} key={event.id}>
                                                        {(provided: DraggableProvided) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className={`p-2 rounded-lg text-xs ${typeColorMap[event.type] || 'bg-gray-100'}`}
                                                            >
                                                                <p className="font-bold text-gray-800">{event.cours?.nom || ''}</p>
                                                                <p className="text-gray-700">{event.enseignants?.nom || ''}</p>
                                                                <p className="text-gray-600 font-semibold">Salle: {event.salles?.nom || ''}</p>
                                                                <p className="text-gray-500 font-bold">[{event.type}]</p>
                                                            </div>
                                                        )}
                                                        </Draggable>
                                                    ))}
                                                    </div>
                                                )}
                                                {provided.placeholder}
                                                </div>
                                            )}
                                            </Droppable>
                                        </td>
                                    );
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
        </DragDropContext>
        </>
    );
};

export default TimetableGrid;