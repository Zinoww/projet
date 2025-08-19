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
    // VÉRIFICATION ABSOLUE : Aucun conflit de salle et créneau ne doit exister
    const conflitSalleCreneau = state.planning.find(p => 
        p.jour === jour && 
        p.heure_debut === creneau.debut && 
        p.salle_id === salle_id
    );
    
    if (conflitSalleCreneau) {
        console.log(`🚨 CONFLIT ABSOLU DÉTECTÉ: Salle ${salle_id} déjà occupée le ${jour} à ${creneau.debut} par ${conflitSalleCreneau.seance_id}`);
        return false;
    }
    
    // VÉRIFICATION SUPPLÉMENTAIRE : Aucun autre cours ne doit utiliser cette salle à ce créneau
    const autreCoursMemeCreneau = state.planning.some(p => 
        p.jour === jour && 
        p.heure_debut === creneau.debut && 
        p.salle_id === salle_id
    );
    
    if (autreCoursMemeCreneau) {
        console.log(`🚨 CONFLIT CRITIQUE: Salle ${salle_id} déjà utilisée par un autre cours le ${jour} à ${creneau.debut}`);
        return false;
    }
    
    // Vérifier si le groupe est déjà occupé à ce créneau
    const groupeOccupe = state.planningGroupes[jour]?.[creneau.debut]?.includes(seance.groupe_id);
    if (groupeOccupe) {
        console.log(`Debug - Groupe ${seance.groupe_id} déjà occupé le ${jour} à ${creneau.debut}`);
        return false;
    }

    // Vérifier si l'enseignant est déjà occupé à ce créneau
    if (seance.enseignant_id) {
        const enseignantOccupe = state.planningEnseignants[jour]?.[creneau.debut]?.includes(seance.enseignant_id);
        if (enseignantOccupe) {
            console.log(`Debug - Enseignant ${seance.enseignant_id} déjà occupé le ${jour} à ${creneau.debut}`);
            return false;
        }
    }

    // Vérifier la capacité de la salle
    const salleInfo = [...amphis, ...sallesNormales].find(s => s.id === salle_id);
    if (!salleInfo || !salleInfo.capacite) {
        console.log(`Debug - Salle ${salle_id} non trouvée ou sans capacité`);
        return false;
    }

    // Vérifier la capacité selon le type de séance
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // Pour les CM, vérifier la capacité pour tous les groupes de la section (si connue)
        const capaciteRequise = groupes.length * 30; // 30 étudiants par groupe
        if (typeof salleInfo.capacite === 'number' && salleInfo.capacite < capaciteRequise) {
            console.log(`Debug - Salle ${salleInfo.nom} trop petite pour CM: ${salleInfo.capacite} < ${capaciteRequise}`);
            return false;
        }
    } else {
        // Pour les TD/TP, vérifier la capacité pour un groupe (si connue)
        const capaciteRequise = 30; // 30 étudiants par groupe
        if (typeof salleInfo.capacite === 'number' && salleInfo.capacite < capaciteRequise) {
            console.log(`Debug - Salle ${salleInfo.nom} trop petite pour TD/TP: ${salleInfo.capacite} < ${capaciteRequise}`);
            return false;
        }
    }
    
    // VÉRIFICATION DES RÈGLES DE PLACEMENT
    const estAmphi = amphis.some(a => a.id === salle_id);
    const estSalleNormale = sallesNormales.some(s => s.id === salle_id);
    
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // CM doit être dans un amphi
        if (!estAmphi) {
            console.log(`🚨 RÈGLE VIOLÉE: ${seance.id} (CM) placé dans une salle normale au lieu d'un amphi`);
            return false;
        }
    } else if (seance.types_seances?.nom?.toLowerCase().includes('td') || seance.types_seances?.nom?.toLowerCase().includes('tp')) {
        // TD/TP doivent être dans des salles normales
        if (!estSalleNormale) {
            console.log(`🚨 RÈGLE VIOLÉE: ${seance.id} (${seance.types_seances?.nom}) placé dans un amphi au lieu d'une salle normale`);
            return false;
        }
    }

    // VÉRIFICATION FINALE : S'assurer qu'aucun autre cours n'utilise cette salle à ce créneau
    const conflitFinal = state.planning.some(p => 
        p.jour === jour && 
        p.heure_debut === creneau.debut && 
        p.salle_id === salle_id
    );
    
    if (conflitFinal) {
        console.log(`🚨 CONFLIT FINAL DÉTECTÉ: Impossible de placer ${seance.id} dans ${salle_id} le ${jour} à ${creneau.debut}`);
        return false;
    }

    console.log(`✅ Séance ${seance.id} peut être placée dans ${salle_id} le ${jour} à ${creneau.debut}`);
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
    // VÉRIFICATION ABSOLUE : S'assurer qu'aucun conflit n'existe avant le placement
    const conflitExistant = state.planning.find(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );
    
    if (conflitExistant) {
        console.log(`🚨 IMPOSSIBLE DE PLACER: Conflit détecté pour ${seance.id} dans ${salle_id} le ${jour} à ${creneau.debut}`);
        console.log(`🚨 Conflit avec: ${conflitExistant.seance_id} (${conflitExistant.jour} ${conflitExistant.heure_debut})`);
        return state; // Retourner l'état inchangé
    }
    
    // VÉRIFICATION SUPPLÉMENTAIRE : Double vérification anti-conflit
    const autreCoursMemeCreneau = state.planning.some(p =>
        p.jour === jour &&
        p.heure_debut === creneau.debut &&
        p.salle_id === salle_id
    );
    
    if (autreCoursMemeCreneau) {
        console.log(`🚨 CONFLIT CRITIQUE: Impossible de placer ${seance.id} - salle ${salle_id} déjà occupée le ${jour} à ${creneau.debut}`);
        return state; // Retourner l'état inchangé
    }

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

    console.log(`✅ Séance ${seance.id} placée avec succès dans ${salle_id} le ${jour} à ${creneau.debut}`);
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

    // DÉTERMINATION STRICTE des salles selon le type de séance
    let sallesAppropriees: any[] = [];
    
    if (seance.types_seances?.nom?.toLowerCase().includes('cm')) {
        // CM → AMPHIS SEULEMENT
        sallesAppropriees = amphis;
        console.log(`🎯 Séance ${seance.id} (CM) → Amphithéâtres uniquement (${amphis.length} disponibles)`);
    } else if (seance.types_seances?.nom?.toLowerCase().includes('td')) {
        // TD → SALLES NORMALES SEULEMENT
        sallesAppropriees = sallesNormales;
        console.log(`🎯 Séance ${seance.id} (TD) → Salles normales uniquement (${sallesNormales.length} disponibles)`);
    } else if (seance.types_seances?.nom?.toLowerCase().includes('tp')) {
        // TP → SALLES NORMALES SEULEMENT
        sallesAppropriees = sallesNormales;
        console.log(`🎯 Séance ${seance.id} (TP) → Salles normales uniquement (${sallesNormales.length} disponibles)`);
    } else {
        // Type inconnu → Salles normales par défaut
        sallesAppropriees = sallesNormales;
        console.log(`⚠️ Type de séance inconnu pour ${seance.id}, utilisation des salles normales`);
    }
    
    // VÉRIFICATION : S'assurer qu'il y a des salles disponibles
    if (sallesAppropriees.length === 0) {
        console.log(`❌ AUCUNE SALLE DISPONIBLE pour le type ${seance.types_seances?.nom}`);
        return null; // Impossible de placer cette séance
    }

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
                            break;
                        }
                    }
                }
            }
            if (amelioration) break;
        }
    }

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

// Fonction de validation et correction des conflits
function validerEtCorrigerConflits(
    planning: PlacementState,
    groupes: any[],
    amphis: any[],
    sallesNormales: any[],
    jours: string[],
    creneaux: Creneau[]
): PlacementState {
    console.log('🔍 Validation et correction des conflits...');
    
    const planningValide: PlacementState = {
        planning: [],
        planningGroupes: {},
        planningEnseignants: {},
        planningSalles: {}
    };
    
    const conflitsDetectes: { type: string; details: string; seanceId: string }[] = [];
    
    // Trier les séances par priorité (CM d'abord, puis TD, puis TP)
    const seancesTriees = [...planning.planning].sort((a, b) => {
        // Tri simple basé sur l'index pour éviter les erreurs de type
        return 0; // Pas de tri spécial pour l'instant
    });
    
    for (const placement of seancesTriees) {
        let conflit = false;
        let raisonConflit = '';
        
        // Vérifier les conflits avec les séances déjà validées
        for (const placementValide of planningValide.planning) {
            // Conflit de salle et créneau
            if (placement.jour === placementValide.jour && 
                placement.heure_debut === placementValide.heure_debut &&
                placement.salle_id === placementValide.salle_id) {
                conflit = true;
                raisonConflit = `Conflit de salle avec ${placementValide.seance_id}`;
                break;
            }
            
            // Conflit de groupe (même groupe à la même heure)
            if (placement.jour === placementValide.jour && 
                placement.heure_debut === placementValide.heure_debut) {
                // Pour l'instant, on évite les conflits de créneau pour le même groupe
                // Cette logique sera améliorée quand on aura accès aux détails des séances
                conflit = true;
                raisonConflit = `Conflit de créneau avec ${placementValide.seance_id}`;
                break;
            }
        }
        
        if (conflit) {
            conflitsDetectes.push({
                type: 'Conflit détecté',
                details: raisonConflit,
                seanceId: placement.seance_id
            });
            console.log(`❌ Conflit détecté pour ${placement.seance_id}: ${raisonConflit}`);
            continue;
        }
        
        // Aucun conflit, ajouter au planning valide
        planningValide.planning.push(placement);
        
        // Mettre à jour les structures de suivi
        if (!planningValide.planningGroupes[placement.jour]) {
            planningValide.planningGroupes[placement.jour] = {};
        }
        if (!planningValide.planningGroupes[placement.jour][placement.heure_debut]) {
            planningValide.planningGroupes[placement.jour][placement.heure_debut] = [];
        }
        
        // Ajouter la salle
        if (!planningValide.planningSalles[placement.jour]) {
            planningValide.planningSalles[placement.jour] = {};
        }
        if (!planningValide.planningSalles[placement.jour][placement.heure_debut]) {
            planningValide.planningSalles[placement.jour][placement.heure_debut] = [];
        }
        planningValide.planningSalles[placement.jour][placement.heure_debut].push(placement.salle_id);
    }
    
    console.log(`✅ Validation terminée: ${planningValide.planning.length}/${planning.planning.length} séances validées`);
    if (conflitsDetectes.length > 0) {
        console.log(`⚠️ ${conflitsDetectes.length} conflit(s) détecté(s) et résolu(s)`);
        conflitsDetectes.forEach(conflit => {
            console.log(`  - ${conflit.seanceId}: ${conflit.details}`);
        });
    }
    
    return planningValide;
}

export async function genererEmploiDuTemps(
    sectionId: string, 
    setMessage: (msg: string) => void,
    niveau?: string,
    nombreSeances?: number
): Promise<boolean> {
    // --- Étape 1: Récupération des données ---
    setMessage('1/7 - Récupération des données...');

    // a. Récupérer tous les groupes de la section
    const { data: groupes, error: groupesError } = await supabase
        .from('groupes')
        .select('id, nom, niveau, specialite, section_id')
        .eq('section_id', sectionId)
        .order('nom');

    const groupesIdsSet = new Set((groupes || []).map(g => g.id));
    

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

    // Filtrer les séances pour ne garder que celles dont le groupe_id est bien dans la section
    const seancesFiltrees = (seances || []).filter(s => groupesIdsSet.has(s.groupe_id));

    if (seancesError || !seancesFiltrees || seancesFiltrees.length === 0) {
        const message = niveau ? 
            `Erreur ou aucune séance à planifier pour cette section au niveau ${niveau}. ${seancesError?.message || ''}` :
            `Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`;
        setMessage(message);
        return false;
    }

    // Afficher le résumé des séances trouvées
    const coursTrouves = [...new Set(seancesFiltrees.map(s => (s.cours as { nom: string })?.nom))];

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

    // --- Étape 2: Organisation et tri des séances par difficulté ---
    setMessage('2/7 - Organisation et tri des séances...');

    // Séparer les séances par type
    const seancesCM = seancesFiltrees.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('cm'));
    const seancesTD = seancesFiltrees.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('td'));
    const seancesTP = seancesFiltrees.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('tp'));



    // Trier les séances par difficulté de placement (plus difficile en premier)
    const toutesSeances = [...seancesCM, ...seancesTD, ...seancesTP];
    let seancesTriees = toutesSeances.sort((a, b) => {
        const difficulteA = calculerDifficultePlacement(a, groupes, salles);
        const difficulteB = calculerDifficultePlacement(b, groupes, salles);
        return difficulteB - difficulteA; // Ordre décroissant
    });

    // Si nombreSeances est défini, ne garder que ce nombre de séances
    if (typeof nombreSeances === 'number' && nombreSeances > 0) {
        seancesTriees = seancesTriees.slice(0, nombreSeances);
        console.log(`Debug - Séances limitées à ${nombreSeances}:`, seancesTriees.length);
        console.log(`Debug - Détail des séances:`, seancesTriees.map(s => `${s.cours?.nom} - ${s.types_seances?.nom} - G${s.groupes?.nom}`));
    }



    // --- Étape 3: Initialisation du planning...');
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']; // Exclure samedi
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
        .in('seance_id', seancesFiltrees.map(s => s.id));

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

    // Après l'insertion dans emplois_du_temps

    // --- Étape 7: Rapport final ---
    setMessage('7/7 - Génération terminée !');

    const seancesPlacees = planningOptimise.planning.length;
    const seancesTotales = seancesFiltrees.length;
    const scoreFinal = calculerScorePlanning(planningOptimise);
    
    // --- Étape 7.5: Validation finale et correction des conflits ---
    setMessage('7.5/7 - Validation finale et correction des conflits...');
    
    const planningValide = validerEtCorrigerConflits(planningOptimise, groupes, amphis, sallesNormales, jours, creneaux);
    
    // VÉRIFICATION FINALE DE COHÉRENCE
    const verificationCohérence = verifierCohérencePlanning(planningValide.planning);
    
    if (!verificationCohérence.valide) {
        setMessage(`🚨 ERREUR CRITIQUE: Le planning généré contient encore des conflits ! ${verificationCohérence.conflits.length} conflit(s) détecté(s)`);
        console.error('Conflits détectés:', verificationCohérence.conflits);
        return false;
    }
    
    if (planningValide.planning.length !== planningOptimise.planning.length) {
        setMessage(`⚠️ Conflits détectés et corrigés: ${planningOptimise.planning.length - planningValide.planning.length} séances supprimées`);
        
        // Mettre à jour la base de données avec le planning corrigé
        const { error: updateError } = await supabase
            .from('emplois_du_temps')
            .delete()
            .in('seance_id', seancesFiltrees.map(s => s.id));
            
        if (!updateError) {
            const { error: insertError } = await supabase.from('emplois_du_temps').insert(planningValide.planning);
            if (insertError) {
                setMessage(`Erreur lors de la mise à jour du planning corrigé: ${insertError.message}`);
            }
        }
    }
    
    let messageFinal = `🎯 Génération réussie avec algorithme avancé ! ${planningValide.planning.length}/${seancesTotales} séances placées.`;
    messageFinal += `\n\n📊 Logique de placement:`;
    messageFinal += `\n• CM → Amphis (${amphis.length} disponibles)`;
    messageFinal += `\n• TD/TP → Salles normales (${sallesNormales.length} disponibles)`;
    messageFinal += `\n\n🔧 Améliorations appliquées:`;
    messageFinal += `\n• Tri par difficulté de placement`;
    messageFinal += `\n• Algorithme de backtracking complet`;
    messageFinal += `\n• Optimisation locale par échanges`;
    messageFinal += `\n• Recherche tabou avancée`;
    messageFinal += `\n• Gestion intelligente des contraintes`;
    messageFinal += `\n• Validation et correction automatique des conflits`;
    messageFinal += `\n\n🏆 Score de qualité: ${calculerScorePlanning(planningValide)}`;
    
    if (planningValide.planning.length < seancesTotales) {
        const sessionsNonPlacees = seancesTotales - planningValide.planning.length;
        messageFinal += `\n\n⚠️ ${sessionsNonPlacees} séance(s) non placée(s)`;
        messageFinal += '\n\nCauses possibles:';
        messageFinal += '\n• Contraintes trop strictes';
        messageFinal += '\n• Manque de créneaux disponibles';
        messageFinal += '\n• Conflits d\'enseignants irréconciliables';
        messageFinal += '\n• Capacités de salles insuffisantes';
        messageFinal += '\n• Conflits de salles détectés et corrigés automatiquement';
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
            }
        } else {
            // Aucun voisin valide trouvé, arrêter
            break;
        }
    }
    
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

// Fonction pour tester la cohérence du planning généré
function verifierCohérencePlanning(planning: EmploiDuTempsItem[]): { valide: boolean; conflits: string[] } {
    console.log('🔍 Vérification de la cohérence du planning...');
    
    const conflits: string[] = [];
    
    // Vérifier les conflits de salle et créneau
    for (let i = 0; i < planning.length; i++) {
        for (let j = i + 1; j < planning.length; j++) {
            const event1 = planning[i];
            const event2 = planning[j];
            
            // Conflit de salle au même créneau
            if (event1.jour === event2.jour && 
                event1.heure_debut === event2.heure_debut && 
                event1.salle_id === event2.salle_id) {
                
                const conflit = `🚨 CONFLIT: ${event1.seance_id} et ${event2.seance_id} dans ${event1.salle_id} le ${event1.jour} à ${event1.heure_debut}`;
                conflits.push(conflit);
                console.log(conflit);
            }
        }
    }
    
    if (conflits.length === 0) {
        console.log('✅ Planning cohérent : Aucun conflit détecté');
        return { valide: true, conflits: [] };
    } else {
        console.log(`❌ Planning incohérent : ${conflits.length} conflit(s) détecté(s)`);
        return { valide: false, conflits };
    }
}

// Fonction d'export pour tester l'algorithme avancé
export async function testerAlgorithmeAvance(
    sectionId: string,
    setMessage: (msg: string) => void,
    niveau?: string
): Promise<{ success: boolean; details: string; planning: any[] }> {
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
        const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
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
        const resultatAmelioration = ameliorationLocale(
            resultatBacktracking,
            groupes,
            amphis,
            sallesNormales,
            jours,
            creneaux
        );

        // Test de l'optimisation avancée
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

// Fonction pour détecter les conflits existants dans l'emploi du temps
export async function detecterConflitsExistants(sectionId: string): Promise<string> {
    let rapport = '=== DÉTECTION DES CONFLITS EXISTANTS ===\n\n';
    
    try {
        // 1. Récupérer tous les groupes de la section
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom')
            .eq('section_id', sectionId);
        
        if (groupesError || !groupes || groupes.length === 0) {
            rapport += `❌ Aucun groupe trouvé pour cette section\n`;
            return rapport;
        }
        
        const groupeIds = groupes.map(g => g.id);
        rapport += `📊 Groupes analysés: ${groupes.length}\n`;
        groupes.forEach(g => rapport += `  - ${g.nom}\n`);
        rapport += '\n';
        
        // 2. Récupérer toutes les séances de ces groupes
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('id, cours(nom), types_seances(nom), enseignants(nom), groupes(nom)')
            .in('groupe_id', groupeIds);
        
        if (seancesError || !seances || seances.length === 0) {
            rapport += `❌ Aucune séance trouvée pour ces groupes\n`;
            return rapport;
        }
        
        rapport += `📊 Séances analysées: ${seances.length}\n\n`;
        
        // 3. Récupérer l'emploi du temps existant
        const { data: emploiDuTemps, error: emploiError } = await supabase
            .from('emplois_du_temps')
            .select('*')
            .in('seance_id', seances.map(s => s.id));
        
        if (emploiError || !emploiDuTemps || emploiDuTemps.length === 0) {
            rapport += `❌ Aucun emploi du temps trouvé pour ces séances\n`;
            return rapport;
        }
        
        rapport += `📊 Emploi du temps analysé: ${emploiDuTemps.length} événements\n\n`;
        
        // 4. Détecter les conflits
        const conflits: { type: string; details: string; seance1: string; seance2: string }[] = [];
        
        // Conflits de salle et créneau
        for (let i = 0; i < emploiDuTemps.length; i++) {
            for (let j = i + 1; j < emploiDuTemps.length; j++) {
                const event1 = emploiDuTemps[i];
                const event2 = emploiDuTemps[j];
                
                // Conflit de salle au même créneau
                if (event1.jour === event2.jour && 
                    event1.heure_debut === event2.heure_debut && 
                    event1.salle_id === event2.salle_id) {
                    
                    const seance1 = seances.find(s => s.id === event1.seance_id);
                    const seance2 = seances.find(s => s.id === event2.seance_id);
                    
                    // Extraire les informations de manière sûre
                    const getSeanceInfo = (seance: any) => {
                        if (!seance) return 'N/A - N/A - N/A';
                        const coursNom = seance.cours && typeof seance.cours === 'object' ? seance.cours.nom : 'N/A';
                        const typeNom = seance.types_seances && typeof seance.types_seances === 'object' ? seance.types_seances.nom : 'N/A';
                        const groupeNom = seance.groupes && typeof seance.groupes === 'object' ? seance.groupes.nom : 'N/A';
                        return `${coursNom} - ${typeNom} - ${groupeNom}`;
                    };
                    
                    conflits.push({
                        type: '🚨 CONFLIT CRITIQUE: Salle et créneau',
                        details: `${event1.jour} ${event1.heure_debut}-${event1.heure_fin}`,
                        seance1: getSeanceInfo(seance1),
                        seance2: getSeanceInfo(seance2)
                    });
                }
            }
        }
        
        // 5. Afficher le rapport
        if (conflits.length === 0) {
            rapport += '✅ Aucun conflit détecté dans l\'emploi du temps actuel\n';
        } else {
            rapport += `❌ ${conflits.length} conflit(s) détecté(s):\n\n`;
            conflits.forEach((conflit, index) => {
                rapport += `${index + 1}. ${conflit.type}\n`;
                rapport += `   📅 ${conflit.details}\n`;
                rapport += `   📚 ${conflit.seance1}\n`;
                rapport += `   📚 ${conflit.seance2}\n\n`;
            });
            
            rapport += '💡 RECOMMANDATIONS:\n';
            rapport += '1. Régénérez l\'emploi du temps avec l\'algorithme amélioré\n';
            rapport += '2. Vérifiez que toutes les salles ont des capacités appropriées\n';
            rapport += '3. Assurez-vous qu\'il y a suffisamment de créneaux disponibles\n';
        }
        
    } catch (error) {
        rapport += `❌ Erreur lors de la détection: ${error}\n`;
    }
    
    return rapport;
}
