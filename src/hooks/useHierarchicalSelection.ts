import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

export interface Filiere { id: string; nom: string }
export interface Section { id: string; nom: string }
export interface Groupe { id: string; nom: string }

export function useHierarchicalSelection() {
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [promotions, setPromotions] = useState<string[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])

    const [selectedFiliere, setSelectedFiliere] = useState('')
    const [selectedPromotion, setSelectedPromotion] = useState('')
    const [selectedSection, setSelectedSection] = useState('')
    const [selectedGroupe, setSelectedGroupe] = useState('')

    const [loading, setLoading] = useState(false)

    // Load filieres
    useEffect(() => {
        async function loadFilieres() {
            setLoading(true)
            const { data, error } = await supabase.from('filieres').select('id, nom').order('nom')
            if (error) console.error('Error loading filieres:', error)
            else {
                setFilieres(data || [])
            }
            setLoading(false)
        }
        loadFilieres()
    }, [])

    // Load promotions (niveaux) when filiere changes, en se basant sur les séances existantes
    useEffect(() => {
        if (!selectedFiliere) {
            setPromotions([])
            return
        }
        async function loadPromotions() {
            setLoading(true)
            // On récupère les niveaux distincts des séances pour la filière sélectionnée
            const { data, error } = await supabase
                .from('seances')
                .select('niveau')
                .eq('filiere_id', selectedFiliere)
                .not('niveau', 'is', null)

            if (error || !data) {
                setPromotions([])
            } else {
                const promotionsUniques = [...new Set(data.map(s => s.niveau).filter(Boolean) as string[])]
                setPromotions(promotionsUniques.sort())
            }
            setLoading(false)
        }
        loadPromotions()
    }, [selectedFiliere])

    // Load sections when promotion changes, en se basant sur les séances existantes
    useEffect(() => {
        if (!selectedFiliere || !selectedPromotion) {
            setSections([])
            return
        }
        async function loadSections() {
            setLoading(true)
            // On récupère les section_id distincts des séances pour la filière et le niveau sélectionnés
            const { data, error } = await supabase
                .from('seances')
                .select('section_id')
                .eq('filiere_id', selectedFiliere)
                .eq('niveau', selectedPromotion)
                .not('section_id', 'is', null)

            if (error || !data || data.length === 0) {
                setSections([])
                setLoading(false)
                return
            }
            const sectionIds = [...new Set(data.map(s => s.section_id).filter(Boolean))]
            if (sectionIds.length === 0) {
                setSections([])
                setLoading(false)
                return
            }
            const { data: finalSections, error: finalSectionsError } = await supabase
                .from('sections')
                .select('id, nom')
                .in('id', sectionIds)
                .order('nom')
            if (finalSectionsError) {
                setSections([])
            } else {
                setSections(finalSections || [])
            }
            setLoading(false)
        }
        loadSections()
    }, [selectedFiliere, selectedPromotion])

    // Load groupes when section changes
    useEffect(() => {
        if (!selectedSection || !selectedPromotion) {
            setGroupes([])
            return
        }
        async function loadGroupes() {
            setLoading(true)
            const { data, error } = await supabase
                .from('groupes')
                .select('id, nom')
                .eq('section_id', selectedSection)
                .eq('niveau', selectedPromotion)
                .order('nom')
            
            if (error) {
                setGroupes([])
            }
            else {
                setGroupes(data || [])
            }
            setLoading(false)
        }
        loadGroupes()
    }, [selectedSection, selectedPromotion])

    return {
        filieres,
        promotions,
        sections,
        groupes,
        selectedFiliere,
        selectedPromotion,
        selectedSection,
        selectedGroupe,
        setSelectedFiliere,
        setSelectedPromotion,
        setSelectedSection,
        setSelectedGroupe,
        loading,
    }
} 