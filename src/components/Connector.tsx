import React from "react";
import { Box } from "@mui/material";
import type { CardStatus } from "../types";
import { PIPELINE_LINE_COLOR } from "../config/pipelineConfig";

const CARD_GAP = 28;

type ConnectorProps = {
  children: React.ReactNode;
};

type StepElement = React.ReactElement<{
  status: CardStatus;
  hasNext?: boolean;
  hasPrev?: boolean;
  prevStatus?: CardStatus;
}>;

export default function Connector({ children }: ConnectorProps) {
  const arr = React.Children.toArray(children);

  // Collect indices of step children (those carrying a `status` prop)
  const stepIndices: number[] = arr.reduce<number[]>((acc, child, i) => {
    if (React.isValidElement(child) && child.props !== null && "status" in (child.props as object)) {
      acc.push(i);
    }
    return acc;
  }, []);

  return (
    <Box>
      {arr.map((child, i) => {
        const isStep = React.isValidElement(child) && child.props !== null && "status" in (child.props as object);

        if (!isStep) {
          return <React.Fragment key={i}>{child}</React.Fragment>;
        }

        const stepRank = stepIndices.indexOf(i);
        const hasPrev = stepRank > 0;
        const hasNext = stepRank < stepIndices.length - 1;
        const prevStatus = hasPrev ? (arr[stepIndices[stepRank - 1]] as StepElement).props.status : undefined;

        const injected = React.cloneElement(child as StepElement, {
          key: i,
          hasNext,
          hasPrev,
          prevStatus,
        });

        return (
          <React.Fragment key={i}>
            {injected}
            {hasNext && (
              <Box
                sx={{
                  width: 2,
                  height: CARD_GAP,
                  background: PIPELINE_LINE_COLOR[(child as StepElement).props.status],
                  ml: "15px",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
