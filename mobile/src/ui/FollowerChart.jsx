import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";

/**
 * Hand-rolled line chart for follower history (react-native-svg Polyline).
 * Mirrors components/follower-chart.tsx's data shape and colors, but recharts
 * doesn't run in React Native and this app avoids charting-library
 * dependencies — a Polyline plus a couple of axis labels is enough for a
 * single-series trend line.
 */
const SERIES_COLOR = "#6b8afd";
const GRID_COLOR = "#2e2e33";

const CHART_HEIGHT = 140;
const PADDING = { top: 8, right: 8, bottom: 8, left: 8 };

function formatCompact(n) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatDay(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function FollowerChart({ data, followers }) {
  const [width, setWidth] = useState(0);

  const current = followers ?? data.at(-1)?.followers ?? null;
  const net = data.length > 1 ? data[data.length - 1].followers - data[0].followers : null;

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-2xl font-bold text-foreground">
          {current === null ? "—" : current.toLocaleString()}
        </Text>
        {net !== null ? (
          <Text className={`text-xs font-medium ${net >= 0 ? "text-success" : "text-error"}`}>
            {net > 0 ? "+" : ""}
            {net.toLocaleString()} over {data.length} days
          </Text>
        ) : null}
      </View>

      {data.length < 2 ? (
        <Text className="mt-3 text-sm text-muted">
          {data.length === 0 ? "No follower snapshots recorded yet." : "One day recorded so far."}{" "}
          A point is added daily — the chart appears once there are at least two.
        </Text>
      ) : (
        <>
          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            className="mt-3"
            style={{ height: CHART_HEIGHT }}
          >
            {width > 0 ? <ChartSvg width={width} data={data} /> : null}
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-[10px] text-muted">{formatDay(data[0].date)}</Text>
            <Text className="text-[10px] text-muted">{formatDay(data[data.length - 1].date)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function ChartSvg({ width, data }) {
  const values = data.map((d) => d.followers);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const points = data
    .map((d, i) => {
      const x = PADDING.left + (i / (data.length - 1)) * innerWidth;
      const y = PADDING.top + innerHeight - ((d.followers - minV) / range) * innerHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        {[0, 0.5, 1].map((t) => {
          const y = PADDING.top + innerHeight * t;
          return (
            <Line
              key={t}
              x1={PADDING.left}
              y1={y}
              x2={width - PADDING.right}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          );
        })}
        <Polyline points={points} fill="none" stroke={SERIES_COLOR} strokeWidth={2} />
      </Svg>
      <View className="absolute left-0 top-0" style={{ left: PADDING.left }}>
        <Text className="text-[10px] text-muted">{formatCompact(maxV)}</Text>
      </View>
      <View className="absolute bottom-0 left-0" style={{ left: PADDING.left }}>
        <Text className="text-[10px] text-muted">{formatCompact(minV)}</Text>
      </View>
    </View>
  );
}
