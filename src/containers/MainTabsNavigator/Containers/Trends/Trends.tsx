// /Users/iradkotton/projects/shaniDms22/src/containers/MainTabsNavigator/Containers/Trends/Trends.tsx

import React, { useState, useMemo, useEffect, useRef } from "react";
import { View, Text, Button, ActivityIndicator, ScrollView } from "react-native";
import Collapsable from "app/components/Collapsable";
import { calculateTrendsMetrics, DayDetail } from "./trendsCalculations";
import { BgSample } from "app/types/day_bgs.types";
import {fetchBgDataForDateRange} from "app/api/apiRequests";
import {
  TrendsContainer,
  DateRangeSelector,
  SectionTitle,
  StatRow,
  StatLabel,
  StatValue,
  ExplanationText,
  CompareBox,
  BoldText,
  MetricSelector,
  MetricButton,
  MetricButtonText,
  Emoji
} from "./Trends.styles";
import {DayInsights} from './TrendsUI';
import {
  loadingSteps,
  MAX_LOADING_TIME,
  WARNING_TIME,
  CHUNK_SIZE
} from './Trends.constants';

type MetricType = 'tir' | 'hypos' | 'hypers';

const Trends: React.FC = () => {
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tir');
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [comparing, setComparing] = useState<boolean>(false);
  const [previousMetrics, setPreviousMetrics] = useState<ReturnType<typeof calculateTrendsMetrics>|null>(null);

  const {start, end} = useMemo(()=>{
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (rangeDays - 1));
    return {start, end};
  }, [rangeDays]);

  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string|null>(null);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const loadingStartTime = useRef<number | null>(null);

  const [partialMetrics, setPartialMetrics] = useState(()=>calculateTrendsMetrics([]));
  const [daysFetched, setDaysFetched] = useState(0);
  const [fetchCancelled, setFetchCancelled] = useState(false);

  useEffect(()=>{
    let isMounted = true;
    async function fetchInChunks() {
      setIsLoading(true);
      setFetchError(null);
      setBgData([]);
      setDaysFetched(0);
      setFetchCancelled(false);
      loadingStartTime.current = Date.now();

      const totalChunks = Math.ceil(rangeDays / CHUNK_SIZE);
      let allData: BgSample[] = [];

      try {
        for (let i=0; i<totalChunks; i++) {
          if (!isMounted || fetchCancelled) break;
          const chunkStart = new Date(start);
          chunkStart.setDate(start.getDate() + i*CHUNK_SIZE);
          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkStart.getDate() + CHUNK_SIZE - 1);
          if (chunkEnd > end) chunkEnd.setTime(end.getTime());

          const dataChunk = await fetchBgDataForDateRange(chunkStart, chunkEnd);
          allData = allData.concat(dataChunk);

          if (!isMounted) return;
          setBgData([...allData]);
          const fetchedDays = Math.min((i+1)*CHUNK_SIZE, rangeDays);
          setDaysFetched(fetchedDays);

          const partial = calculateTrendsMetrics(allData);
          setPartialMetrics(partial);
        }
      } catch(e:any) {
        if (isMounted) {
          setFetchError(e.message || 'Failed to fetch data');
        }
      } finally {
        if (isMounted && !fetchCancelled) {
          setIsLoading(false);
        }
      }
    }
    fetchInChunks();
  }, [start, end, rangeDays]);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingStepIndex(prev => (prev+1)%loadingSteps.length);
      }, 2000);
      return ()=>clearInterval(interval);
    } else {
      setLoadingStepIndex(0);
      loadingStartTime.current = null;
    }
  }, [isLoading]);

  const cancelFetch = () => {
    setFetchCancelled(true);
    setIsLoading(false);
  };

  const loadingTime = loadingStartTime.current ? Date.now() - loadingStartTime.current : 0;
  const showLongWaitWarning = isLoading && !fetchCancelled && !fetchError && loadingTime > WARNING_TIME && loadingTime < MAX_LOADING_TIME;
  const showMaxWaitReached = isLoading && !fetchCancelled && !fetchError && loadingTime >= MAX_LOADING_TIME;

  const metrics = fetchCancelled ? partialMetrics : calculateTrendsMetrics(bgData);

  async function handleCompare() {
    setComparing(true);
    try {
      const prevEnd = new Date(start);
      prevEnd.setHours(23,59,59,999);
      const prevStart = new Date(prevEnd);
      prevStart.setHours(0,0,0,0);
      prevStart.setDate(prevEnd.getDate() - (rangeDays - 1));

      const prevBgData = await fetchBgDataForDateRange(prevStart, prevEnd);
      const prevMetrics = calculateTrendsMetrics(prevBgData);
      setPreviousMetrics(prevMetrics);
      setShowComparison(true);
    } catch(e:any) {
      console.log('Failed to compare previous period:', e.message);
    } finally {
      setComparing(false);
    }
  }

  let displayDays:DayDetail[] = metrics.dailyDetails;
  if (selectedMetric==='tir'){
    displayDays = [...displayDays].sort((a,b)=>b.tir - a.tir);
  } else if (selectedMetric==='hypos') {
    displayDays = [...displayDays].sort((a,b)=>a.seriousHypos - b.seriousHypos);
  } else {
    displayDays = [...displayDays].sort((a,b)=>a.seriousHypers - b.seriousHypers);
  }

  const bestDayDetail = displayDays[0];
  const worstDayDetail = displayDays[displayDays.length-1];
  const bestDay = bestDayDetail?.dateString || '';
  const worstDay = worstDayDetail?.dateString || '';

  return (
    <TrendsContainer>
      <DateRangeSelector>
        <Button title="7 Days" onPress={() => setRangeDays(7)} />
        <Button title="14 Days" onPress={() => setRangeDays(14)} />
        <Button title="30 Days" onPress={() => setRangeDays(30)} />
      </DateRangeSelector>

      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <SectionTitle>Data Range</SectionTitle>
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>
          {start.toDateString()} to {end.toDateString()} ({rangeDays} days)
        </Text>
      </View>

      {isLoading && !fetchError && !fetchCancelled && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>{loadingSteps[loadingStepIndex]}</Text>
          <Text>Fetched {daysFetched} / {rangeDays} days so far...</Text>
          {showLongWaitWarning && (
            <Text style={{color:'orange',marginTop:5}}>
              Taking longer than usual. You can wait or cancel.
            </Text>
          )}
          {showMaxWaitReached && (
            <View style={{marginTop:5, alignItems:'center'}}>
              <Text style={{color:'red'}}>
                Very long loading time. Maybe reduce the date range.
              </Text>
            </View>
          )}
          <Button title="Cancel" onPress={cancelFetch} />
        </View>
      )}

      {!isLoading && fetchError && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text style={{color:'red'}}>Failed to fetch data: {fetchError}. Check your network and try again.</Text>
          <Button title="Retry" onPress={() => setRangeDays(prev=>prev)} />
        </View>
      )}

      {!isLoading && !fetchError && bgData.length === 0 && !fetchCancelled && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>No BG data available for this period. Try a shorter date range or check your data source.</Text>
        </View>
      )}

      {!isLoading && fetchCancelled && metrics.dailyDetails.length > 0 && (
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <Text>Loading cancelled. Showing partial results for {daysFetched}/{rangeDays} days.</Text>
        </View>
      )}

      {!isLoading && !fetchError && metrics.dailyDetails.length > 0 && (
        <ScrollView>
          <Collapsable title="Overall Stats (Key Indicators)">
            <StatRow>
              <StatLabel>Average BG:</StatLabel>
              <StatValue>{metrics.averageBg.toFixed(1)} mg/dL (±{metrics.stdDev.toFixed(1)})</StatValue>
              <ExplanationText>Lower avg BG often means better control, but avoid hypos.</ExplanationText>
            </StatRow>
            <StatRow>
              <StatLabel>Morning Avg (0-6)</StatLabel>
              <StatValue>{metrics.morningAvg.toFixed(1)} mg/dL</StatValue>
            </StatRow>
            <StatRow>
              <StatLabel>Midday Avg (6-12)</StatLabel>
              <StatValue>{metrics.middayAvg.toFixed(1)} mg/dL</StatValue>
            </StatRow>
            <StatRow>
              <StatLabel>Afternoon Avg (12-18)</StatLabel>
              <StatValue>{metrics.afternoonAvg.toFixed(1)} mg/dL</StatValue>
            </StatRow>
            <StatRow>
              <StatLabel>Evening Avg (18-24)</StatLabel>
              <StatValue>{metrics.eveningAvg.toFixed(1)} mg/dL</StatValue>
            </StatRow>
            <StatRow>
              <StatLabel>Serious Hypos ({"<"}56 mg/dL) <Emoji>↓</Emoji></StatLabel>
              <StatValue color="red">{metrics.seriousHyposCount} total</StatValue>
              <ExplanationText>Hypos are dangerous. Aim to reduce these events.</ExplanationText>
            </StatRow>
            <StatRow>
              <StatLabel>Serious Hypers (>220 mg/dL) <Emoji>↑</Emoji></StatLabel>
              <StatValue color="orange">{metrics.seriousHypersCount} total</StatValue>
              <ExplanationText>High readings can lead to complications. Consider adjustments.</ExplanationText>
            </StatRow>
          </Collapsable>

          <Collapsable title="Select Metric for Best/Worst Day">
            <ExplanationText>Choose how to determine best/worst day:</ExplanationText>
            <MetricSelector>
              <MetricButton selected={selectedMetric==='tir'} onPress={()=>setSelectedMetric('tir')}>
                <MetricButtonText>TIR</MetricButtonText>
              </MetricButton>
              <MetricButton selected={selectedMetric==='hypos'} onPress={()=>setSelectedMetric('hypos')}>
                <MetricButtonText>Fewest Hypos</MetricButtonText>
              </MetricButton>
              <MetricButton selected={selectedMetric==='hypers'} onPress={()=>setSelectedMetric('hypers')}>
                <MetricButtonText>Fewest Hypers</MetricButtonText>
              </MetricButton>
            </MetricSelector>
          </Collapsable>

          {metrics.dailyDetails.length > 0 && (() => {
            // Filter and sort days based on selected metric
            let displayDays = [...metrics.dailyDetails];
            if (selectedMetric==='tir'){
              displayDays.sort((a,b)=>b.tir - a.tir);
            } else if (selectedMetric==='hypos') {
              displayDays.sort((a,b)=>a.seriousHypos - b.seriousHypos);
            } else {
              displayDays.sort((a,b)=>a.seriousHypers - b.seriousHypers);
            }

            const bestDayDetail = displayDays[0];
            const worstDayDetail = displayDays[displayDays.length-1];
            const bestDay = bestDayDetail?.dateString || '';
            const worstDay = worstDayDetail?.dateString || '';

            return (
              <DayInsights
                bestDayDetail={bestDayDetail}
                worstDayDetail={worstDayDetail}
                bestDay={bestDay}
                worstDay={worstDay}
                selectedMetric={selectedMetric}
              />
            );
          })()}

          {(metrics.dailyDetails.length > 0) && (
            <Collapsable title="Compare with Previous Period">
              {!showComparison && !comparing && (
                <Button title="Compare with previous period" onPress={handleCompare} />
              )}
              {comparing && <ActivityIndicator size="small" color="#000" />}

              {showComparison && previousMetrics && (
                <CompareBox>
                  <BoldText>Comparison:</BoldText>
                  <ExplanationText>Comparing this {rangeDays}-day period to the previous {rangeDays}-day period.</ExplanationText>
                  <StatRow>
                    <StatLabel>Avg BG Difference:</StatLabel>
                    <StatValue>
                      {metrics.averageBg.toFixed(1)} vs {previousMetrics.averageBg.toFixed(1)} mg/dL
                      ({(metrics.averageBg - previousMetrics.averageBg).toFixed(1)})
                    </StatValue>
                  </StatRow>
                  <StatRow>
                    <StatLabel>Serious Hypos/Day Difference:</StatLabel>
                    <StatValue>
                      {(metrics.seriousHyposCount / rangeDays).toFixed(2)} vs {(previousMetrics.seriousHyposCount / rangeDays).toFixed(2)}
                    </StatValue>
                  </StatRow>
                  <StatRow>
                    <StatLabel>Serious Hypers/Day Difference:</StatLabel>
                    <StatValue>
                      {(metrics.seriousHypersCount / rangeDays).toFixed(2)} vs {(previousMetrics.seriousHypersCount / rangeDays).toFixed(2)}
                    </StatValue>
                  </StatRow>
                  <ExplanationText>Are things improving or getting worse? Adjust accordingly.</ExplanationText>
                </CompareBox>
              )}
            </Collapsable>
          )}
        </ScrollView>
      )}
    </TrendsContainer>
  );
};

export default Trends;
