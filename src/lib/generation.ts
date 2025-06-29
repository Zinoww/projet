import { supabase } from '@/src/lib/supabaseClient'

// --- 1. TYPE DEFINITIONS ---

interface Creneau {
    debut: string; // "HH:mm:ss"
    fin: string;
}

interface EmploiDuTempsItem {
    seance_id: string;
    jour: string;
    heure_debut: string;
    heure_fin: string;
    salle_id: string;
}

interface SeancePlacement {
    seance: any;
    jour: string;
    creneau: Creneau;
    salle_id: string;
}

interface PlacementState {
    planning: EmploiDuTempsItem[];
    planningGroupes: { [key: string]: { [key: string]: string[] } };
    planningEnseignants: { [key: string]: { [key: string]: string[] } };
    planningSalles: { [key: string]: { [key: string]: string[] } };
}

// --- 2. HELPER FUNCTIONS ---

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Fonction pour calculer la difficulté de placement d'une séance
function calculerDifficultePlacement(seance: any, groupes: any[], salles: any[]): number {
    let difficulte = 0;
    
    // Plus de groupes = plus difficile
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        difficulte += groupes.length * 10;
    } else {
        difficulte += 5; // TD/TP
    }
    
    // Enseignant assigné = plus difficile
    if (seance.enseignant_id) {
        difficulte += 20;
    }
    
    // Durée plus longue = plus difficile
    difficulte += (seance.duree_minutes || 90) / 30;
    
    return difficulte;
}

// Fonction pour vérifier si une séance peut être placée
function peutPlacerSeance(
    seance: any,
    jour: string,
    creneau: Creneau,
    salle_id: string,
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[]
): boolean {
    // Vérifier si le groupe est disponible
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // Pour les CM, vérifier que tous les groupes sont libres
        const groupesOccupe = state.planningGroupes[jour]?.[creneau.debut]?.length > 0;
        if (groupesOccupe) return false;
    } else {
        // Pour les TD/TP, vérifier que le groupe spécifique est libre
        const groupeOccupe = state.planningGroupes[jour]?.[creneau.debut]?.includes(seance.groupe_id);
        if (groupeOccupe) return false;
    }

    // Vérifier si l'enseignant est disponible
    if (seance.enseignant_id) {
        const enseignantOccupe = state.planningEnseignants[jour]?.[creneau.debut]?.includes(seance.enseignant_id);
        if (enseignantOccupe) return false;
    }

    // Vérifier si la salle est disponible
    const salleOccupee = state.planningSalles[jour]?.[creneau.debut]?.includes(salle_id);
    if (salleOccupee) return false;

    // Vérifier la capacité de la salle
    const salle = [...amphis, ...sallesNormales].find(s => s.id === salle_id);
    if (!salle || !salle.capacite) return false;

    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // Pour les CM, vérifier la capacité pour tous les groupes
        if (salle.capacite < groupes.length * 30) return false;
    } else {
        // Pour les TD/TP, vérifier la capacité pour un groupe
        if (salle.capacite < 30) return false;
    }

    return true;
}

// Fonction pour placer une séance
function placerSeance(
    seance: any,
    jour: string,
    creneau: Creneau,
    salle_id: string,
    state: PlacementState,
    groupes: any[]
): PlacementState {
    const newState = {
        planning: [...state.planning, {
            seance_id: seance.id,
            jour: jour,
            heure_debut: creneau.debut,
            heure_fin: creneau.fin,
            salle_id: salle_id
        }],
        planningGroupes: { ...state.planningGroupes },
        planningEnseignants: { ...state.planningEnseignants },
        planningSalles: { ...state.planningSalles }
    };

    // Initialiser les structures si nécessaire
    if (!newState.planningGroupes[jour]) newState.planningGroupes[jour] = {};
    if (!newState.planningGroupes[jour][creneau.debut]) newState.planningGroupes[jour][creneau.debut] = [];
    if (!newState.planningEnseignants[jour]) newState.planningEnseignants[jour] = {};
    if (!newState.planningEnseignants[jour][creneau.debut]) newState.planningEnseignants[jour][creneau.debut] = [];
    if (!newState.planningSalles[jour]) newState.planningSalles[jour] = {};
    if (!newState.planningSalles[jour][creneau.debut]) newState.planningSalles[jour][creneau.debut] = [];

    // Marquer les groupes comme occupés
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        groupes.forEach(groupe => {
            if (!newState.planningGroupes[jour][creneau.debut].includes(groupe.id)) {
                newState.planningGroupes[jour][creneau.debut].push(groupe.id);
            }
        });
    } else {
        if (!newState.planningGroupes[jour][creneau.debut].includes(seance.groupe_id)) {
            newState.planningGroupes[jour][creneau.debut].push(seance.groupe_id);
        }
    }

    // Marquer l'enseignant comme occupé
    if (seance.enseignant_id) {
        if (!newState.planningEnseignants[jour][creneau.debut].includes(seance.enseignant_id)) {
            newState.planningEnseignants[jour][creneau.debut].push(seance.enseignant_id);
        }
    }

    // Marquer la salle comme occupée
    if (!newState.planningSalles[jour][creneau.debut].includes(salle_id)) {
        newState.planningSalles[jour][creneau.debut].push(salle_id);
    }

    return newState;
}

// Fonction de backtracking principale
function backtrackingPlacement(
    seances: any[],
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[],
    jours: string[],
    creneaux: Creneau[],
    maxIterations: number = 10000
): PlacementState | null {
    if (seances.length === 0) {
        return state; // Solution trouvée
    }

    if (maxIterations <= 0) {
        return null; // Timeout
    }

    const seance = seances[0];
    const seancesRestantes = seances.slice(1);

    // Déterminer les salles appropriées selon le type
    const sallesAppropriees = seance.types_seances?.nom?.toLowerCase().includes('cm') 
        ? amphis 
        : sallesNormales;

    // Essayer tous les créneaux possibles
    for (const jour of shuffle([...jours])) {
        for (const creneau of shuffle([...creneaux])) {
            // Essayer toutes les salles appropriées
            for (const salle of shuffle([...sallesAppropriees])) {
                if (peutPlacerSeance(seance, jour, creneau, salle.id, state, groupes, amphis, sallesNormales)) {
                    const newState = placerSeance(seance, jour, creneau, salle.id, state, groupes);
                    
                    const resultat = backtrackingPlacement(
                        seancesRestantes,
                        newState,
                        groupes,
                        amphis,
                        sallesNormales,
                        jours,
                        creneaux,
                        maxIterations - 1
                    );

                    if (resultat) {
                        return resultat; // Solution trouvée
                    }
                    // Sinon, continuer avec la prochaine salle
                }
            }
        }
    }

    return null; // Aucune solution trouvée
}

// Fonction d'amélioration locale
function ameliorationLocale(
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[],
    jours: string[],
    creneaux: Creneau[]
): PlacementState {
    let amelioration = true;
    let iterations = 0;
    const maxIterations = 100;

    console.log('🔧 Début de l\'amélioration locale...');

    while (amelioration && iterations < maxIterations) {
        amelioration = false;
        iterations++;

        // Essayer d'échanger des créneaux pour optimiser
        for (let i = 0; i < state.planning.length; i++) {
            for (let j = i + 1; j < state.planning.length; j++) {
                const placement1 = state.planning[i];
                const placement2 = state.planning[j];

                // Vérifier si l'échange est possible et bénéfique
                if (peutEchangerPlacements(placement1, placement2, state, groupes, amphis, sallesNormales)) {
                    // Calculer le score avant échange
                    const scoreAvant = calculerScorePlanning(state);
                    
                    // Effectuer l'échange
                    const newState = echangerPlacements(placement1, placement2, state);
                    if (newState) {
                        // Calculer le score après échange
                        const scoreApres = calculerScorePlanning(newState);
                        
                        // Garder l'échange seulement s'il améliore le score
                        if (scoreApres > scoreAvant) {
                            state = newState;
                            amelioration = true;
                            console.log(`✅ Échange améliorant: ${scoreAvant} → ${scoreApres}`);
                            break;
                        }
                    }
                }
            }
            if (amelioration) break;
        }
    }

    console.log(`🔧 Amélioration locale terminée après ${iterations} itérations`);
    return state;
}

// Fonction pour calculer un score de qualité du planning
function calculerScorePlanning(state: PlacementState): number {
    let score = 0;
    
    // Score de base pour chaque séance placée
    score += state.planning.length * 100;
    
    // Bonus pour la répartition équilibrée
    const repartitionJours: { [key: string]: number } = {};
    state.planning.forEach(p => {
        repartitionJours[p.jour] = (repartitionJours[p.jour] || 0) + 1;
    });
    
    // Pénaliser les jours surchargés
    Object.values(repartitionJours).forEach(count => {
        if (count > 3) {
            score -= (count - 3) * 10; // Pénalité pour surcharge
        }
    });
    
    // Bonus pour les créneaux matinaux (préférés)
    state.planning.forEach(p => {
        const heure = parseInt(p.heure_debut.split(':')[0]);
        if (heure < 12) {
            score += 5; // Bonus pour le matin
        }
    });
    
    return score;
}

// Fonction pour vérifier si deux placements peuvent être échangés
function peutEchangerPlacements(
    placement1: EmploiDuTempsItem,
    placement2: EmploiDuTempsItem,
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[]
): boolean {
    // Ne pas échanger si c'est le même placement
    if (placement1.seance_id === placement2.seance_id) return false;
    
    // Récupérer les détails des séances
    const seance1 = state.planning.find(p => p.seance_id === placement1.seance_id);
    const seance2 = state.planning.find(p => p.seance_id === placement2.seance_id);
    
    if (!seance1 || !seance2) return false;
    
    // Vérifier si l'échange respecte les contraintes
    const tempState = { ...state };
    
    // Simuler l'échange
    const tempJour1 = placement1.jour;
    const tempCreneau1 = { debut: placement1.heure_debut, fin: placement1.heure_fin };
    const tempSalle1 = placement1.salle_id;
    
    const tempJour2 = placement2.jour;
    const tempCreneau2 = { debut: placement2.heure_debut, fin: placement2.heure_fin };
    const tempSalle2 = placement2.salle_id;
    
    // Vérifier si les nouveaux placements sont possibles
    const peutPlacer1 = peutPlacerSeance(
        seance1 as any,
        tempJour2,
        tempCreneau2,
        tempSalle2,
        tempState,
        groupes,
        amphis,
        sallesNormales
    );
    
    const peutPlacer2 = peutPlacerSeance(
        seance2 as any,
        tempJour1,
        tempCreneau1,
        tempSalle1,
        tempState,
        groupes,
        amphis,
        sallesNormales
    );
    
    return peutPlacer1 && peutPlacer2;
}

// Fonction pour échanger deux placements
function echangerPlacements(
    placement1: EmploiDuTempsItem,
    placement2: EmploiDuTempsItem,
    state: PlacementState
): PlacementState | null {
    try {
        const newState = {
            planning: [...state.planning],
            planningGroupes: { ...state.planningGroupes },
            planningEnseignants: { ...state.planningEnseignants },
            planningSalles: { ...state.planningSalles }
        };
        
        // Trouver les indices des placements
        const index1 = newState.planning.findIndex(p => p.seance_id === placement1.seance_id);
        const index2 = newState.planning.findIndex(p => p.seance_id === placement2.seance_id);
        
        if (index1 === -1 || index2 === -1) return null;
        
        // Échanger les créneaux et salles
        const temp = { ...newState.planning[index1] };
        newState.planning[index1] = {
            ...newState.planning[index2],
            jour: placement1.jour,
            heure_debut: placement1.heure_debut,
            heure_fin: placement1.heure_fin,
            salle_id: placement1.salle_id
        };
        newState.planning[index2] = {
            ...temp,
            jour: placement2.jour,
            heure_debut: placement2.heure_debut,
            heure_fin: placement2.heure_fin,
            salle_id: placement2.salle_id
        };
        
        // Mettre à jour les structures de suivi
        // Supprimer les anciennes entrées
        if (newState.planningGroupes[placement1.jour]?.[placement1.heure_debut]) {
            newState.planningGroupes[placement1.jour][placement1.heure_debut] = 
                newState.planningGroupes[placement1.jour][placement1.heure_debut].filter(id => id !== placement1.seance_id);
        }
        if (newState.planningGroupes[placement2.jour]?.[placement2.heure_debut]) {
            newState.planningGroupes[placement2.jour][placement2.heure_debut] = 
                newState.planningGroupes[placement2.jour][placement2.heure_debut].filter(id => id !== placement2.seance_id);
        }
        
        // Ajouter les nouvelles entrées
        if (!newState.planningGroupes[placement2.jour]) newState.planningGroupes[placement2.jour] = {};
        if (!newState.planningGroupes[placement2.jour][placement2.heure_debut]) newState.planningGroupes[placement2.jour][placement2.heure_debut] = [];
        if (!newState.planningGroupes[placement1.jour]) newState.planningGroupes[placement1.jour] = {};
        if (!newState.planningGroupes[placement1.jour][placement1.heure_debut]) newState.planningGroupes[placement1.jour][placement1.heure_debut] = [];
        
        newState.planningGroupes[placement2.jour][placement2.heure_debut].push(placement1.seance_id);
        newState.planningGroupes[placement1.jour][placement1.heure_debut].push(placement2.seance_id);
        
        return newState;
    } catch (error) {
        console.error('Erreur lors de l\'échange:', error);
        return null;
    }
}

// Fonction de diagnostic simplifiée pour éviter les problèmes de performance
export async function diagnostiquerDonneesSimple(sectionId: string): Promise<string> {
    let rapport = '=== DIAGNOSTIC SIMPLIFIÉ ===\n\n';
    
    try {
        // 1. Vérifier la section
        const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('nom')
            .eq('id', sectionId)
            .single();
        
        if (sectionError || !section) {
            rapport += `❌ Section ${sectionId} non trouvée\n`;
            return rapport;
        }
        
        rapport += `✅ Section: ${section.nom}\n\n`;
        
        // 2. Compter les groupes de cette section
        const { count: nbGroupes, error: groupesError } = await supabase
            .from('groupes')
            .select('*', { count: 'exact', head: true })
            .eq('section_id', sectionId);
        
        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Groupes dans cette section: ${nbGroupes || 0}\n\n`;
        
        // 3. Compter les séances totales pour cette section
        const { data: groupes, error: groupesDataError } = await supabase
            .from('groupes')
            .select('id')
            .eq('section_id', sectionId);
        
        if (groupesDataError || !groupes) {
            rapport += `❌ Erreur récupération groupes: ${groupesDataError?.message}\n`;
            return rapport;
        }

        const groupeIds = groupes.map(g => g.id);
        const { count: nbSeances, error: seancesError } = await supabase
            .from('seances')
            .select('*', { count: 'exact', head: true })
            .in('groupe_id', groupeIds);
        
        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Total des séances pour cette section: ${nbSeances || 0}\n\n`;
        
        // 4. Analyser les types de séances
        if (nbSeances && nbSeances > 0) {
            const { data: seancesDetails, error: detailsError } = await supabase
            .from('seances')
                .select('id, duree_minutes, cours_id, type_id, groupe_id, cours(nom), types_seances(nom), enseignants(nom)')
                .in('groupe_id', groupeIds)
                .limit(10);
            
            if (detailsError) {
                rapport += `❌ Erreur détails séances: ${detailsError.message}\n`;
        } else {
                rapport += `📋 Analyse des séances:\n`;
                
                // Compter par type
                const typesCount: { [key: string]: number } = {};
                seancesDetails?.forEach((seance: unknown) => {
                    const seanceData = seance as { types_seances?: { nom: string } };
                    const type = (seanceData.types_seances?.nom || 'Inconnu');
                    typesCount[type] = (typesCount[type] || 0) + 1;
                });
                
                Object.entries(typesCount).forEach(([type, count]) => {
                    rapport += `  • ${type}: ${count} séance(s)\n`;
                });
                
                rapport += '\n';
            }
        }
        
        rapport += '=== RECOMMANDATIONS ===\n';
        if (!nbGroupes || nbGroupes === 0) {
            rapport += '1. Créez des groupes pour cette section\n';
        }
        if (!nbSeances || nbSeances === 0) {
            rapport += '2. Créez des séances pour les groupes de cette section\n';
        }
        if (nbGroupes && nbGroupes > 0 && nbSeances && nbSeances > 0) {
            rapport += '3. Vérifiez que les séances ont des types appropriés (CM, TD, TP)\n';
            rapport += '4. Assurez-vous d\'avoir des salles avec des capacités appropriées\n';
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// --- 3. CORE GENERATION LOGIC ---

export async function genererEmploiDuTemps(
    sectionId: string, 
    setMessage: (msg: string) => void,
    niveau?: string
): Promise<boolean> {
    // --- Étape 1: Récupération des données ---
    setMessage('1/7 - Récupération des données...');

    // a. Récupérer tous les groupes de la section
    const { data: groupes, error: groupesError } = await supabase
        .from('groupes')
        .select('id, nom, niveau, specialite, section_id')
        .eq('section_id', sectionId)
        .order('nom');

    if (groupesError || !groupes || groupes.length === 0) {
        setMessage('Aucun groupe trouvé pour cette section.');
        return false;
    }

    const groupeIds = groupes.map(g => g.id);

    // b. Récupérer TOUS les cours du niveau si spécifié
    let coursIds: string[] = [];
    if (niveau) {
        setMessage(`1/7 - Récupération de TOUS les cours du niveau ${niveau}...`);
        const { data: cours, error: coursError } = await supabase
            .from('cours')
            .select('id, nom')
            .eq('niveau', niveau);
        
        if (coursError || !cours || cours.length === 0) {
            setMessage(`Aucun cours trouvé pour le niveau ${niveau}.`);
            return false;
        }
        
        coursIds = cours.map(c => c.id);
        console.log(`Cours trouvés pour ${niveau}:`, cours.map(c => c.nom));
    }

    // c. Récupérer toutes les séances de ces groupes ET cours
    let seancesQuery = supabase
        .from('seances')
        .select('*, cours(nom, niveau), types_seances(nom), enseignants(nom)')
        .in('groupe_id', groupeIds);

    // Si un niveau est spécifié, filtrer par les cours de ce niveau
    if (niveau && coursIds.length > 0) {
        seancesQuery = seancesQuery.in('cours_id', coursIds);
    }

    const { data: seances, error: seancesError } = await seancesQuery;

    if (seancesError || !seances || seances.length === 0) {
        const message = niveau ? 
            `Erreur ou aucune séance à planifier pour cette section au niveau ${niveau}. ${seancesError?.message || ''}` :
            `Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`;
        setMessage(message);
        return false;
    }

    // Afficher le résumé des séances trouvées
    const coursTrouves = [...new Set(seances.map(s => (s.cours as { nom: string })?.nom))];
    console.log(`Séances trouvées pour ${niveau || 'tous niveaux'}:`, {
        totalSeances: seances.length,
        coursConcernes: coursTrouves,
        groupesConcernes: groupes.length
    });

    // d. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // Séparer les amphis des salles normales
    const amphis = salles.filter(s => 
        s.nom.toLowerCase().includes('amphi') || 
        s.nom.toLowerCase().includes('amphithéâtre') ||
        s.nom.toLowerCase().includes('auditorium') ||
        (s.capacite && s.capacite >= 100) // Salles avec grande capacité considérées comme amphis
    );
    const sallesNormales = salles.filter(s => 
        !s.nom.toLowerCase().includes('amphi') && 
        !s.nom.toLowerCase().includes('amphithéâtre') &&
        !s.nom.toLowerCase().includes('auditorium') &&
        (!s.capacite || s.capacite < 100) // Salles avec capacité normale
    );

    console.log(`Salles disponibles:`, salles.map(s => `${s.nom} (${s.capacite} places)`));
    console.log(`Amphis disponibles:`, amphis.map(s => `${s.nom} (${s.capacite} places)`));
    console.log(`Salles normales disponibles:`, sallesNormales.map(s => `${s.nom} (${s.capacite} places)`));

    // --- Étape 2: Organisation et tri des séances par difficulté ---
    setMessage('2/7 - Organisation et tri des séances...');

    // Séparer les séances par type
    const seancesCM = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('cm'));
    const seancesTD = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('td'));
    const seancesTP = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('tp'));

    console.log(`Séances trouvées: ${seancesCM.length} CM, ${seancesTD.length} TD, ${seancesTP.length} TP`);
    console.log(`Groupes dans la section: ${groupes.length} (${groupes.map(g => g.nom).join(', ')})`);
    console.log(`Capacité nécessaire pour CM: ${groupes.length * 30} étudiants`);

    // Trier les séances par difficulté de placement (plus difficile en premier)
    const toutesSeances = [...seancesCM, ...seancesTD, ...seancesTP];
    const seancesTriees = toutesSeances.sort((a, b) => {
        const difficulteA = calculerDifficultePlacement(a, groupes, salles);
        const difficulteB = calculerDifficultePlacement(b, groupes, salles);
        return difficulteB - difficulteA; // Ordre décroissant
    });

    console.log('Séances triées par difficulté:', seancesTriees.map(s => ({
        cours: (s.cours as { nom: string })?.nom,
        type: (s.types_seances as { nom: string })?.nom,
        difficulte: calculerDifficultePlacement(s, groupes, salles)
    })));

    // --- Étape 3: Initialisation du planning ---
    setMessage('3/7 - Initialisation du planning...');
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
    const creneaux: Creneau[] = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    // État initial du planning
    const initialState: PlacementState = {
        planning: [],
        planningGroupes: {},
        planningEnseignants: {},
        planningSalles: {}
    };

    // --- Étape 4: Algorithme de backtracking ---
    setMessage('4/7 - Placement des séances avec backtracking...');

    const resultat = backtrackingPlacement(
        seancesTriees,
        initialState,
        groupes,
        amphis,
        sallesNormales,
        jours,
        creneaux,
        15000 // Limite d'itérations
    );

    if (!resultat) {
        setMessage('Impossible de placer toutes les séances avec l\'algorithme de backtracking.');
        return false;
    }

    // --- Étape 5: Amélioration locale ---
    setMessage('5/7 - Amélioration locale du planning...');

    const planningAmeliore = ameliorationLocale(
        resultat,
        groupes,
        amphis,
        sallesNormales,
        jours,
        creneaux
    );

    // --- Étape 5.5: Optimisation avancée ---
    setMessage('5.5/7 - Optimisation avancée avec recherche tabou...');

    const planningOptimise = optimisationAvancee(
        planningAmeliore,
        groupes,
        amphis,
        sallesNormales,
        jours,
        creneaux
    );

    // --- Étape 6: Sauvegarde du résultat ---
    setMessage('6/7 - Sauvegarde du nouvel emploi du temps...');
    
    // a. Supprimer les anciennes entrées de l'emploi du temps pour cette section
    const { error: deleteError } = await supabase
        .from('emplois_du_temps')
        .delete()
        .in('seance_id', seances.map(s => s.id));

    if (deleteError) {
        setMessage(`Erreur lors du nettoyage de l'ancien planning: ${deleteError.message}`);
        return false;
    }

    // b. Insérer le nouveau planning
    const { error: insertError } = await supabase.from('emplois_du_temps').insert(planningOptimise.planning);
    if (insertError) {
        setMessage(`Erreur lors de la sauvegarde du nouveau planning: ${insertError.message}`);
        return false;
    }

    // --- Étape 7: Rapport final ---
    setMessage('7/7 - Génération terminée !');

    const seancesPlacees = planningOptimise.planning.length;
    const seancesTotales = seances.length;
    const scoreFinal = calculerScorePlanning(planningOptimise);
    
    let messageFinal = `🎯 Génération réussie avec algorithme avancé ! ${seancesPlacees}/${seancesTotales} séances placées.`;
    messageFinal += `\n\n📊 Logique de placement:`;
    messageFinal += `\n• CM → Amphis (${amphis.length} disponibles)`;
    messageFinal += `\n• TD/TP → Salles normales (${sallesNormales.length} disponibles)`;
    messageFinal += `\n\n🔧 Améliorations appliquées:`;
    messageFinal += `\n• Tri par difficulté de placement`;
    messageFinal += `\n• Algorithme de backtracking complet`;
    messageFinal += `\n• Optimisation locale par échanges`;
    messageFinal += `\n• Recherche tabou avancée`;
    messageFinal += `\n• Gestion intelligente des contraintes`;
    messageFinal += `\n\n🏆 Score de qualité: ${scoreFinal}`;
    
    if (seancesPlacees < seancesTotales) {
        const sessionsNonPlacees = seancesTotales - seancesPlacees;
        messageFinal += `\n\n⚠️ ${sessionsNonPlacees} séance(s) non placée(s)`;
        messageFinal += '\n\nCauses possibles:';
        messageFinal += '\n• Contraintes trop strictes';
        messageFinal += '\n• Manque de créneaux disponibles';
        messageFinal += '\n• Conflits d\'enseignants irréconciliables';
        messageFinal += '\n• Capacités de salles insuffisantes';
    }
    
    setMessage(messageFinal);
    return true;
}

// Fonction pour vérifier la cohérence des données
export async function verifierCohérence(): Promise<string> {
    let rapport = '=== VÉRIFICATION DE LA COHÉRENCE ===\n\n';
    
    try {
        // 1. Lister toutes les sections
        const { data: sections, error: sectionsError } = await supabase
            .from('sections')
            .select('id, nom')
            .order('nom');
        
        if (sectionsError) {
            rapport += `❌ Erreur sections: ${sectionsError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Sections existantes (${sections?.length || 0}):\n`;
        sections?.forEach(s => {
            rapport += `  - ${s.nom} (ID: ${s.id})\n`;
        });
        rapport += '\n';
        
        // 2. Lister tous les groupes
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom, section_id')
            .order('nom');
        
        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Groupes existants (${groupes?.length || 0}):\n`;
        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            rapport += `  - ${g.nom} → Section: ${section?.nom || 'INCONNUE'} (${g.section_id})\n`;
        });
        rapport += '\n';
        
        // 3. Identifier les problèmes
        rapport += '🔍 PROBLÈMES IDENTIFIÉS:\n';
        let problemes = 0;
        
        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            if (!section) {
                rapport += `❌ Groupe "${g.nom}" → Section ID ${g.section_id} n'existe pas\n`;
                problemes++;
            }
        });
        
        if (problemes === 0) {
            rapport += '✅ Aucun problème de cohérence détecté\n';
        } else {
            rapport += `\n💡 SOLUTIONS:\n`;
            rapport += `1. Vérifiez que toutes les sections existent\n`;
            rapport += `2. Supprimez ou corrigez les groupes orphelins\n`;
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// Fonction d'optimisation avancée avec recherche tabou
function optimisationAvancee(
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[],
    jours: string[],
    creneaux: Creneau[]
): PlacementState {
    console.log('🚀 Début de l\'optimisation avancée...');
    
    let meilleurState = { ...state };
    let meilleurScore = calculerScorePlanning(state);
    let iterations = 0;
    const maxIterations = 200;
    const tabouList: string[] = [];
    const tabouSize = 10;
    
    while (iterations < maxIterations) {
        iterations++;
        
        // Générer des voisins
        const voisins = genererVoisins(state, groupes, amphis, sallesNormales, jours, creneaux);
        
        let meilleurVoisin = null;
        let meilleurScoreVoisin = -Infinity;
        
        for (const voisin of voisins) {
            const scoreVoisin = calculerScorePlanning(voisin);
            const hashVoisin = JSON.stringify(voisin.planning);
            
            // Vérifier si le voisin n'est pas dans la liste tabou
            if (!tabouList.includes(hashVoisin) && scoreVoisin > meilleurScoreVoisin) {
                meilleurVoisin = voisin;
                meilleurScoreVoisin = scoreVoisin;
            }
        }
        
        if (meilleurVoisin) {
            state = meilleurVoisin;
            const hashState = JSON.stringify(state.planning);
            tabouList.push(hashState);
            
            // Maintenir la taille de la liste tabou
            if (tabouList.length > tabouSize) {
                tabouList.shift();
            }
            
            // Mettre à jour le meilleur état global
            if (meilleurScoreVoisin > meilleurScore) {
                meilleurState = { ...state };
                meilleurScore = meilleurScoreVoisin;
                console.log(`🏆 Nouveau meilleur score: ${meilleurScore}`);
            }
        } else {
            // Aucun voisin valide trouvé, arrêter
            break;
        }
    }
    
    console.log(`🚀 Optimisation avancée terminée après ${iterations} itérations`);
    return meilleurState;
}

// Fonction pour générer des voisins (solutions proches)
function genererVoisins(
    state: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[],
    jours: string[],
    creneaux: Creneau[]
): PlacementState[] {
    const voisins: PlacementState[] = [];
    
    // Générer des échanges simples
    for (let i = 0; i < Math.min(state.planning.length, 5); i++) {
        for (let j = i + 1; j < Math.min(state.planning.length, 5); j++) {
            const placement1 = state.planning[i];
            const placement2 = state.planning[j];
            
            if (peutEchangerPlacements(placement1, placement2, state, groupes, amphis, sallesNormales)) {
                const voisin = echangerPlacements(placement1, placement2, state);
                if (voisin) {
                    voisins.push(voisin);
                }
            }
        }
    }
    
    // Générer des déplacements simples
    for (let i = 0; i < Math.min(state.planning.length, 3); i++) {
        const placement = state.planning[i];
        
        // Essayer de déplacer vers un autre créneau
        for (const jour of jours) {
            for (const creneau of creneaux) {
                if (jour !== placement.jour || creneau.debut !== placement.heure_debut) {
                    const sallesAppropriees = [...amphis, ...sallesNormales];
                    
                    for (const salle of sallesAppropriees) {
                        // Créer un état temporaire sans ce placement
                        const tempState = {
                            planning: state.planning.filter(p => p.seance_id !== placement.seance_id),
                            planningGroupes: { ...state.planningGroupes },
                            planningEnseignants: { ...state.planningEnseignants },
                            planningSalles: { ...state.planningSalles }
                        };
                        
                        // Vérifier si le nouveau placement est possible
                        const seance = { id: placement.seance_id } as any;
                        if (peutPlacerSeance(seance, jour, creneau, salle.id, tempState, groupes, amphis, sallesNormales)) {
                            const nouveauPlacement = {
                                seance_id: placement.seance_id,
                                jour: jour,
                                heure_debut: creneau.debut,
                                heure_fin: creneau.fin,
                                salle_id: salle.id
                            };
                            
                            const voisin = {
                                planning: [...tempState.planning, nouveauPlacement],
                                planningGroupes: tempState.planningGroupes,
                                planningEnseignants: tempState.planningEnseignants,
                                planningSalles: tempState.planningSalles
                            };
                            
                            voisins.push(voisin);
                        }
                    }
                }
            }
        }
    }
    
    return voisins.slice(0, 10); // Limiter le nombre de voisins
}

// Fonction d'export pour tester l'algorithme
export async function testerAlgorithmeAvance(
    sectionId: string,
    setMessage: (msg: string) => void,
    niveau?: string
): Promise<{ success: boolean; details: string; planning: any[] }> {
    console.log('🧪 Test de l\'algorithme avancé...');
    
    try {
        // Récupérer les données de base
        const { data: groupes } = await supabase
            .from('groupes')
            .select('id, nom, niveau, specialite, section_id')
            .eq('section_id', sectionId)
            .order('nom');

        if (!groupes || groupes.length === 0) {
            return { success: false, details: 'Aucun groupe trouvé', planning: [] };
        }

        const groupeIds = groupes.map(g => g.id);
        let coursIds: string[] = [];
        
        if (niveau) {
            const { data: cours } = await supabase
                .from('cours')
                .select('id, nom')
                .eq('niveau', niveau);
            coursIds = cours?.map(c => c.id) || [];
        }

        let seancesQuery = supabase
            .from('seances')
            .select('*, cours(nom, niveau), types_seances(nom), enseignants(nom)')
            .in('groupe_id', groupeIds);

        if (niveau && coursIds.length > 0) {
            seancesQuery = seancesQuery.in('cours_id', coursIds);
        }

        const { data: seances } = await seancesQuery;
        if (!seances || seances.length === 0) {
            return { success: false, details: 'Aucune séance trouvée', planning: [] };
        }

        const { data: salles } = await supabase.from('salles').select('id, nom, capacite');
        if (!salles || salles.length === 0) {
            return { success: false, details: 'Aucune salle trouvée', planning: [] };
        }

        // Séparer les salles
        const amphis = salles.filter(s => 
            s.nom.toLowerCase().includes('amphi') || 
            s.nom.toLowerCase().includes('amphithéâtre') ||
            s.nom.toLowerCase().includes('auditorium') ||
            (s.capacite && s.capacite >= 100)
        );
        const sallesNormales = salles.filter(s => 
            !s.nom.toLowerCase().includes('amphi') && 
            !s.nom.toLowerCase().includes('amphithéâtre') &&
            !s.nom.toLowerCase().includes('auditorium') &&
            (!s.capacite || s.capacite < 100)
        );

        // Organiser les séances
        const seancesCM = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('cm'));
        const seancesTD = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('td'));
        const seancesTP = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('tp'));

        const toutesSeances = [...seancesCM, ...seancesTD, ...seancesTP];
        const seancesTriees = toutesSeances.sort((a, b) => {
            const difficulteA = calculerDifficultePlacement(a, groupes, salles);
            const difficulteB = calculerDifficultePlacement(b, groupes, salles);
            return difficulteB - difficulteA;
        });

        // Configuration
        const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
        const creneaux: Creneau[] = [
            { debut: '08:00:00', fin: '09:30:00' },
            { debut: '09:30:00', fin: '11:00:00' },
            { debut: '11:00:00', fin: '12:30:00' },
            { debut: '13:30:00', fin: '15:00:00' },
            { debut: '15:00:00', fin: '16:30:00' }
        ];

        const initialState: PlacementState = {
            planning: [],
            planningGroupes: {},
            planningEnseignants: {},
            planningSalles: {}
        };

        // Test du backtracking
        console.log('🧪 Test du backtracking...');
        const resultatBacktracking = backtrackingPlacement(
            seancesTriees,
            initialState,
            groupes,
            amphis,
            sallesNormales,
            jours,
            creneaux,
            10000
        );

        if (!resultatBacktracking) {
            return { success: false, details: 'Backtracking échoué', planning: [] };
        }

        // Test de l'amélioration locale
        console.log('🧪 Test de l\'amélioration locale...');
        const resultatAmelioration = ameliorationLocale(
            resultatBacktracking,
            groupes,
            amphis,
            sallesNormales,
            jours,
            creneaux
        );

        // Test de l'optimisation avancée
        console.log('🧪 Test de l\'optimisation avancée...');
        const resultatOptimisation = optimisationAvancee(
            resultatAmelioration,
            groupes,
            amphis,
            sallesNormales,
            jours,
            creneaux
        );

        // Calculer les scores
        const scoreBacktracking = calculerScorePlanning(resultatBacktracking);
        const scoreAmelioration = calculerScorePlanning(resultatAmelioration);
        const scoreOptimisation = calculerScorePlanning(resultatOptimisation);

        const details = `
🧪 RÉSULTATS DU TEST ALGORITHME AVANCÉ

📊 Données d'entrée:
• Groupes: ${groupes.length}
• Séances: ${seances.length} (${seancesCM.length} CM, ${seancesTD.length} TD, ${seancesTP.length} TP)
• Salles: ${salles.length} (${amphis.length} amphis, ${sallesNormales.length} normales)

🎯 Résultats de placement:
• Backtracking: ${resultatBacktracking.planning.length}/${seances.length} séances
• Après amélioration locale: ${resultatAmelioration.planning.length}/${seances.length} séances
• Après optimisation avancée: ${resultatOptimisation.planning.length}/${seances.length} séances

🏆 Scores de qualité:
• Backtracking: ${scoreBacktracking}
• Amélioration locale: ${scoreAmelioration} (${scoreAmelioration > scoreBacktracking ? '+' : ''}${scoreAmelioration - scoreBacktracking})
• Optimisation avancée: ${scoreOptimisation} (${scoreOptimisation > scoreAmelioration ? '+' : ''}${scoreOptimisation - scoreAmelioration})

✅ Amélioration totale: ${scoreOptimisation - scoreBacktracking} points
        `;

        return {
            success: true,
            details: details,
            planning: resultatOptimisation.planning
        };

    } catch (error) {
        console.error('Erreur lors du test:', error);
        return {
            success: false,
            details: `Erreur: ${error}`,
            planning: []
        };
    }
}
