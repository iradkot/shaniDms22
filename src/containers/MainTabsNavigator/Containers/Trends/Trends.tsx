// /Users/iradkotton/projects/shaniDms22/src/containers/MainTabsNavigator/Containers/Trends/Trends.tsx

import React, { useState, useMemo, useEffect, useRef } from "react";
import { View, Text, Button, ActivityIndicator, ScrollView } from "react-native";
import Collapsable from "app/components/Collapsable";

// Import your existing components
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';

// Keep your calculations and utilities
import { calculateTrendsMetrics, DayDetail } from "./trendsCalculations";
import { BgSample } from "app/types/day_bgs.types";
import { fetchBgDataForDateRange } from "app/api/apiRequests";

// Import your styled components and constants
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
  Emoji, OverallStatsGrid, OverallStatsItem, Row
} from "./Trends.styles";
import { DayInsights } from "./TrendsUI";
import {
  loadingSteps,
  MAX_LOADING_TIME,
  WARNING_TIME,
  CHUNK_SIZE
} from "./Trends.constants";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

type MetricType = 'tir' | 'hypos' | 'hypers';

const Trends: React.FC = () => {
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tir');
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [comparing, setComparing] = useState<boolean>(false);
  const [previousMetrics, setPreviousMetrics] = useState<ReturnType<typeof calculateTrendsMetrics>|null>(null);

  // Date range logic
  const {start, end} = useMemo(()=>{
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - (rangeDays - 1));
    return {start, end};
  }, [rangeDays]);

  // State for BG data
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string|null>(null);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const loadingStartTime = useRef<number | null>(null);

  // For partial metrics if user cancels
  const [partialMetrics, setPartialMetrics] = useState(()=>calculateTrendsMetrics([]));
  const [daysFetched, setDaysFetched] = useState(0);
  const [fetchCancelled, setFetchCancelled] = useState(false);

  // Fetch BG data in CHUNK_SIZE increments
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
      } catch(e: any) {
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

    return () => {
      isMounted = false;
    };
  }, [start, end, rangeDays]);

  // Loading steps indicator
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingStepIndex(prev => (prev+1) % loadingSteps.length);
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

  // Show warnings if loading is too long
  const loadingTime = loadingStartTime.current ? Date.now() - loadingStartTime.current : 0;
  const showLongWaitWarning = isLoading && !fetchCancelled && !fetchError && loadingTime > WARNING_TIME && loadingTime < MAX_LOADING_TIME;
  const showMaxWaitReached = isLoading && !fetchCancelled && !fetchError && loadingTime >= MAX_LOADING_TIME;

  // If user canceled, show partial metrics, else show final
  const metrics = fetchCancelled ? partialMetrics : calculateTrendsMetrics(bgData);

  // Compare with previous period
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

  // Sorting for best/worst day
  let displayDays: DayDetail[] = metrics.dailyDetails;
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
      {/* Top Buttons to Select Date Range */}
      <DateRangeSelector>
        <Button title="7 Days" onPress={() => setRangeDays(7)} />
        <Button title="14 Days" onPress={() => setRangeDays(14)} />
        <Button title="30 Days" onPress={() => setRangeDays(30)} />
      </DateRangeSelector>

      {/* Show date range */}
      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <SectionTitle>Data Range</SectionTitle>
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>
          {start.toDateString()} to {end.toDateString()} ({rangeDays} days)
        </Text>
      </View>

      {/* Loading / Error / No data states */}
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

      {/* If we have data, show the new layout */}
      {!isLoading && !fetchError && metrics.dailyDetails.length > 0 && (
        <ScrollView>
          {/*
            1. Show Time-In-Range row
            2. Show BG Stats row (lowest BG, highest BG, average BG, etc.)
            3. Show Insulin Stats Row
          */}
          <View style={{ marginBottom: 15 }}>
            <SectionTitle>Key Glucose Trends</SectionTitle>
            <TimeInRangeRow bgData={bgData} />
          </View>

          <View style={{ marginBottom: 15 }}>
            <SectionTitle>Quick Stats</SectionTitle>
            <StatsRow bgData={bgData} />
          </View>

          <View style={{ marginBottom: 15 }}>
            <SectionTitle>Insulin Overview</SectionTitle>
            {/*
              Example usage: pass insulin data + basal profile data if available.
              If you don’t have insulin data or basal profile for Trends, you can pass your own props.
            */}
            {/*
              <InsulinStatsRow
                insulinData={insulinData}
                basalProfileData={basalProfileData}
                startDate={start}
                endDate={end}
              />
            */}
            <Text style={{ color: 'gray', fontStyle: 'italic', marginVertical: 5 }}>
              (Insulin data not provided in this example — adapt as needed)
            </Text>
          </View>

          {/* Collapsable sections with deeper insights */}
          <Collapsable title="Overall Stats (Key Indicators)">
            <OverallStatsGrid>
              {/* 1. Average BG */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="chart-line" size={24} color="#333" style={{ marginRight: 6 }} />
                  <StatLabel>Average BG</StatLabel>
                </Row>
                <StatValue>
                  {metrics.averageBg.toFixed(1)} mg/dL (±{metrics.stdDev.toFixed(1)})
                </StatValue>
                <ExplanationText>
                  Lower avg BG often means better control, but avoid hypos.
                </ExplanationText>
              </OverallStatsItem>

              {/* 2. Serious Hypos */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="alert-octagon" size={24} color="red" style={{ marginRight: 6 }} />
                  <StatLabel>Serious Hypos</StatLabel>
                </Row>
                <StatValue color="red">
                  {metrics.seriousHyposCount} total
                </StatValue>
                <ExplanationText>
                  Hypos are dangerous. Aim to reduce these events.
                </ExplanationText>
              </OverallStatsItem>

              {/* 3. Serious Hypers */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="arrow-up-bold" size={24} color="#ff9800" style={{ marginRight: 6 }} />
                  <StatLabel>Serious Hypers</StatLabel>
                </Row>
                <StatValue color="orange">
                  {metrics.seriousHypersCount} total
                </StatValue>
                <ExplanationText>
                  High readings can lead to complications.
                </ExplanationText>
              </OverallStatsItem>

              {/* 4. Morning Average */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="weather-sunset-up" size={24} color="#333" style={{ marginRight: 6 }} />
                  <StatLabel>Morning Avg</StatLabel>
                </Row>
                <StatValue>
                  {metrics.morningAvg.toFixed(1)} mg/dL
                </StatValue>
                <ExplanationText>0:00-6:00</ExplanationText>
              </OverallStatsItem>

              {/* 5. Midday Average */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="weather-sunny" size={24} color="#333" style={{ marginRight: 6 }} />
                  <StatLabel>Midday Avg</StatLabel>
                </Row>
                <StatValue>
                  {metrics.middayAvg.toFixed(1)} mg/dL
                </StatValue>
                <ExplanationText>6:00-12:00</ExplanationText>
              </OverallStatsItem>

              {/* 6. Afternoon Average */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="weather-sunset-down" size={24} color="#333" style={{ marginRight: 6 }} />
                  <StatLabel>Afternoon Avg</StatLabel>
                </Row>
                <StatValue>
                  {metrics.afternoonAvg.toFixed(1)} mg/dL
                </StatValue>
                <ExplanationText>12:00-18:00</ExplanationText>
              </OverallStatsItem>

              {/* 7. Evening Average */}
              <OverallStatsItem>
                <Row style={{ alignItems: 'center', marginBottom: 5 }}>
                  <Icon name="weather-night" size={24} color="#333" style={{ marginRight: 6 }} />
                  <StatLabel>Evening Avg</StatLabel>
                </Row>
                <StatValue>
                  {metrics.eveningAvg.toFixed(1)} mg/dL
                </StatValue>
                <ExplanationText>18:00-24:00</ExplanationText>
              </OverallStatsItem>
            </OverallStatsGrid>
          </Collapsable>

          <Collapsable title="Select Metric for Best/Worst Day">
            <ExplanationText>Choose how to determine best/worst day:</ExplanationText>
            <MetricSelector>
              <MetricButton
                selected={selectedMetric==='tir'}
                onPress={()=>setSelectedMetric('tir')}
              >
                <MetricButtonText>TIR</MetricButtonText>
              </MetricButton>
              <MetricButton
                selected={selectedMetric==='hypos'}
                onPress={()=>setSelectedMetric('hypos')}
              >
                <MetricButtonText>Fewest Hypos</MetricButtonText>
              </MetricButton>
              <MetricButton
                selected={selectedMetric==='hypers'}
                onPress={()=>setSelectedMetric('hypers')}
              >
                <MetricButtonText>Fewest Hypers</MetricButtonText>
              </MetricButton>
            </MetricSelector>
          </Collapsable>

          {/* Show Best/Worst Days (sorted by selected metric) */}
          {metrics.dailyDetails.length > 0 && (() => {
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

          {/* Compare with previous period */}
          {metrics.dailyDetails.length > 0 && (
            <Collapsable title="Compare with Previous Period">
              {!showComparison && !comparing && (
                <Button title="Compare with previous period" onPress={handleCompare} />
              )}
              {comparing && <ActivityIndicator size="small" color="#000" />}

              {showComparison && previousMetrics && (
                <CompareBox>
                  <BoldText>Comparison:</BoldText>
                  <ExplanationText>
                    Comparing this {rangeDays}-day period to the previous {rangeDays}-day period.
                  </ExplanationText>
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
                      {(metrics.seriousHyposCount / rangeDays).toFixed(2)} vs{" "}
                      {(previousMetrics.seriousHyposCount / rangeDays).toFixed(2)}
                    </StatValue>
                  </StatRow>
                  <StatRow>
                    <StatLabel>Serious Hypers/Day Difference:</StatLabel>
                    <StatValue>
                      {(metrics.seriousHypersCount / rangeDays).toFixed(2)} vs{" "}
                      {(previousMetrics.seriousHypersCount / rangeDays).toFixed(2)}
                    </StatValue>
                  </StatRow>
                  <ExplanationText>
                    Are things improving or getting worse? Adjust accordingly.
                  </ExplanationText>
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
