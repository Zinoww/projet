import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Définir les styles pour le PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
  },
  header: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 20,
    color: '#1f2937',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    color: '#6b7280',
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    minHeight: 35,
    alignItems: 'center',
  },
  tableColHeader: {
    width: '20%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
    backgroundColor: '#f3f4f6',
  },
  tableCol: {
    width: '20%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableCellHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#374151',
  },
  tableCell: {
    fontSize: 10,
    textAlign: 'center',
    color: '#1f2937',
  },
  timeSlot: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
  },
  courseInfo: {
    fontSize: 9,
    color: '#1f2937',
    marginBottom: 2,
  },
  teacherInfo: {
    fontSize: 8,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  roomInfo: {
    fontSize: 8,
    color: '#059669',
    fontWeight: 'bold',
  },
  typeBadge: {
    fontSize: 7,
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    padding: '2 4',
    borderRadius: 2,
    marginBottom: 2,
  },
  typeTD: {
    backgroundColor: '#10b981',
  },
  typeTP: {
    backgroundColor: '#f59e0b',
  },
  emptyCell: {
    fontSize: 9,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});

// Fonction pour obtenir la couleur du type de cours
const getTypeStyle = (type: string) => {
  switch (type) {
    case 'TD':
      return [styles.typeBadge, styles.typeTD];
    case 'TP':
      return [styles.typeBadge, styles.typeTP];
    default:
      return [styles.typeBadge];
  }
};

// Fonction pour formater l'heure
const formatTime = (time: string) => {
  return time.substring(0, 5);
};

// Fonction pour organiser les données par jour et créneau
const organizeDataByDay = (data: any[]) => {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const timeSlots = [
    { start: '08:00', end: '09:30' },
    { start: '09:30', end: '11:00' },
    { start: '11:00', end: '12:30' },
    { start: '13:30', end: '15:00' },
    { start: '15:00', end: '16:30' },
  ];

  const organized: any = {};

  days.forEach(day => {
    organized[day] = {};
    timeSlots.forEach(slot => {
      organized[day][`${slot.start}-${slot.end}`] = null;
    });
  });

  data.forEach(item => {
    const date = new Date(item.date);
    const dayIndex = date.getDay();
    let dayName;
    
    if (dayIndex === 0) dayName = 'Dimanche';
    else if (dayIndex === 1) dayName = 'Lundi';
    else if (dayIndex === 2) dayName = 'Mardi';
    else if (dayIndex === 3) dayName = 'Mercredi';
    else if (dayIndex === 4) dayName = 'Jeudi';
    else if (dayIndex === 5) dayName = 'Vendredi';
    else if (dayIndex === 6) dayName = 'Samedi';
    else dayName = 'Lundi';
    
    // Correspondance plus flexible des créneaux
    const timeKey = `${item.heure_debut}-${item.heure_fin}`;
    
    // Essayer de trouver le créneau le plus proche
    let bestMatch = null;
    let bestMatchKey = null;
    
    timeSlots.forEach(slot => {
      const slotKey = `${slot.start}-${slot.end}`;
      if (slot.start === item.heure_debut && slot.end === item.heure_fin) {
        bestMatch = item;
        bestMatchKey = slotKey;
      }
    });
    
    if (bestMatch && bestMatchKey && organized[dayName] && organized[dayName][bestMatchKey] === null) {
      organized[dayName][bestMatchKey] = bestMatch;
    } else if (organized[dayName]) {
      // Si pas de correspondance exacte, mettre dans le premier créneau libre
      for (const slotKey in organized[dayName]) {
        if (organized[dayName][slotKey] === null) {
          organized[dayName][slotKey] = item;
          break;
        }
      }
    }
  });

  return { days, timeSlots, organized };
};

interface PDFPlanningProps {
  data: any[];
  weekStart?: string;
  selectedGroupe?: string;
  groupes?: any[];
}

const PDFPlanning: React.FC<PDFPlanningProps> = ({ data, weekStart, selectedGroupe, groupes }) => {
  const { days, timeSlots, organized } = organizeDataByDay(data);
  
  // Utiliser la semaine des données existantes au lieu de la semaine actuelle
  let weekStartDate;
  if (data.length > 0) {
    // Prendre la première date des données
    const firstDate = new Date(data[0].date);
    const monday = new Date(firstDate);
    monday.setDate(firstDate.getDate() - firstDate.getDay() + 1); // Lundi de cette semaine
    weekStartDate = monday;
  } else {
    // Fallback sur la semaine actuelle si pas de données
    const currentDate = new Date();
    weekStartDate = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 1));
  }

  // Obtenir le nom du groupe sélectionné
  const selectedGroupeName = selectedGroupe && groupes ? groupes.find(g => g.id === selectedGroupe)?.nom : null;

  // Debug détaillé
  console.log('=== DEBUG PDF ===');
  console.log('PDFPlanning - Nombre de données reçues:', data.length);
  console.log('PDFPlanning - Données brutes:', data);
  console.log('PDFPlanning - Données organisées:', organized);
  console.log('PDFPlanning - Jours:', days);
  console.log('PDFPlanning - Créneaux:', timeSlots);
  console.log('PDFPlanning - Date de début de semaine:', weekStartDate);
  console.log('PDFPlanning - Groupe sélectionné:', selectedGroupeName);
  
  // Vérifier si les données ont les bonnes propriétés
  if (data.length > 0) {
    console.log('PDFPlanning - Premier élément:', data[0]);
    console.log('PDFPlanning - Date du premier élément:', data[0].date);
    console.log('PDFPlanning - Heure début du premier élément:', data[0].heure_debut);
    console.log('PDFPlanning - Heure fin du premier élément:', data[0].heure_fin);
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo de l'établissement */}
        <View style={{ textAlign: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 16, color: '#1f2937', marginBottom: 5 }}>🏫</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>Établissement d'Enseignement</Text>
        </View>

        <Text style={styles.header}>Emploi du Temps</Text>
        
        {selectedGroupeName && (
          <Text style={styles.subtitle}>
            Groupe : {selectedGroupeName}
          </Text>
        )}
        
        <Text style={styles.subtitle}>
          Semaine du {weekStartDate.toLocaleDateString('fr-FR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          })}
        </Text>
        
        {data.length === 0 && (
          <Text style={styles.subtitle}>Aucun emploi du temps disponible</Text>
        )}

        {data.length > 0 && (
          <>
            <View style={styles.table}>
              {/* En-tête avec les jours */}
              <View style={styles.tableRow}>
                <View style={styles.tableColHeader}>
                  <Text style={styles.tableCellHeader}>Horaire</Text>
                </View>
                {days.map((day, index) => (
                  <View key={index} style={styles.tableColHeader}>
                    <Text style={styles.tableCellHeader}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Lignes pour chaque créneau horaire */}
              {timeSlots.map((slot, slotIndex) => (
                <View key={slotIndex} style={styles.tableRow}>
                  <View style={styles.tableCol}>
                    <Text style={styles.timeSlot}>
                      {formatTime(slot.start)} - {formatTime(slot.end)}
                    </Text>
                  </View>
                  
                  {days.map((day, dayIndex) => {
                    const courseData = organized[day][`${slot.start}-${slot.end}`];
                    
                    return (
                      <View key={dayIndex} style={styles.tableCol}>
                        {courseData ? (
                          <View>
                            <Text style={getTypeStyle(courseData.type)}>
                              {courseData.type}
                            </Text>
                            <Text style={styles.courseInfo}>
                              {courseData.cours.nom}
                            </Text>
                            <Text style={styles.teacherInfo}>
                              {courseData.enseignants.nom}
                            </Text>
                            <Text style={styles.roomInfo}>
                              {courseData.salles.nom}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.emptyCell}>Libre</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Liste simple de tous les cours en cas de problème avec le tableau */}
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>Tous les cours :</Text>
              {data.map((item, index) => (
                <View key={index} style={{ marginBottom: 8, padding: 5, border: '1px solid #e5e7eb' }}>
                  <Text style={{ fontSize: 10 }}>
                    {item.date} - {item.heure_debut}-{item.heure_fin} - {item.type} - {item.cours.nom} - {item.enseignants.nom} - {item.salles.nom}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Page>
    </Document>
  );
};

export default PDFPlanning; 