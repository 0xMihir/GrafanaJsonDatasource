import { DataSource } from 'DataSource';
import React, { ComponentType } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, Input, Select } from '@grafana/ui';
import { find, isArray } from 'lodash';
import { GenericOptions, GrafanaQuery, MetricConfig, MetricPayloadConfig } from '../types';
import { EditorField, EditorFieldGroup } from '@grafana/experimental';
import { QueryBuilderTextArea } from './QueryBuilderTextArea';
import { QueryBuilderPayloadSelect } from './QueryBuilderPayloadSelect';
import { QueryBuilderTag } from './QueryBuilderTag';

interface LastQuery {
  payload: string | { [key: string]: any };
  metric: string;
}

type EditorProps = QueryEditorProps<DataSource, GrafanaQuery, GenericOptions>;

interface Props extends EditorProps {
  payload: { [key: string]: any };
}

export const QueryBuilder: ComponentType<Props> = (props) => {
  const { datasource, onChange, onRunQuery, query } = props;
  const [metric, setMetric] = React.useState<SelectableValue<string | number>>();
  const [payload, setPayload] = React.useState(props.payload ?? '');

  const [unusedPayload, setUnusedPayload] = React.useState<Array<{ name: string, value: any }>>([]);

  const [lastQuery, setLastQuery] = React.useState<LastQuery | null>(null);
  const [payloadConfig, setPayloadConfig] = React.useState<MetricPayloadConfig[]>([]);
  const [metricOptions, setMetricOptions] = React.useState<MetricConfig[]>([]);
  const [isMetricOptionsLoading, setIsMetricOptionsLoading] = React.useState<boolean>(false);

  const loadMetrics = React.useCallback(() => {
    return datasource.listMetrics(metric?.value ?? query.target ?? '', payload).then(
      (metrics) => {
        const foundMetric = find(metrics, (metric) => metric.value === query.target);
        setMetric(foundMetric === undefined ? { label: '', value: '' } : foundMetric);
        setPayloadConfig(foundMetric?.payloads ?? []);
        return metrics;
      },
      (response) => {
        setMetric({ label: '', value: '' });
        setMetricOptions([]);
        throw new Error(response.statusText);
      }
    );
  }, [datasource, payload, metric?.value]);

  const loadMetricOptions = React.useCallback(() => {
    setIsMetricOptionsLoading(true);
    loadMetrics()
      .then((metrics) => {
        setMetricOptions(metrics);
      })
      .finally(() => {
        setIsMetricOptionsLoading(false);
      });
  }, [loadMetrics, setMetricOptions, setIsMetricOptionsLoading]);

  // Initializing metric options
  React.useEffect(() => loadMetricOptions(), []);

  React.useEffect(() => {
    if (metric?.value === undefined || metric?.value === '') {
      return;
    }

    if (lastQuery !== null && metric?.value === lastQuery.metric && payload === lastQuery.payload) {
      return;
    }

    setLastQuery({ payload, metric: metric.value.toString() });

    onChange({ ...query, payload, target: metric.value.toString() });

    onRunQuery();
  }, [payload, metric]);

  React.useEffect(() => {
    const newUnusedPayload: Array<{ name: string; value: any }> = [];
    for (const key in payload) {
      const foundConfig = payloadConfig.find((item) => item.name === key)
      if (!foundConfig) {
        newUnusedPayload.push({ name: key, value: payload[key] })
      }
      setUnusedPayload(newUnusedPayload)
    }
  }, [payload, payloadConfig]);

  const changePayload = (
    name: string,
    reloadMetric?: boolean,
    v?: SelectableValue<string | number> | Array<SelectableValue<string | number>>
  ) => {
    setPayload((ori) => {
      let newPayload: { [key: string]: any } = { ... ori };
      if (isArray(v)) {
        newPayload[name] = v
          .map((item) => item.value)
          .filter((item) => (item !== undefined ? item.toString().length > 0 : false));
      } else if (v && v.value !== undefined && v.value !== '') {
        newPayload[name] = v.value;
      } else {
        delete newPayload[name]
      }
      if (reloadMetric) {
        setIsMetricOptionsLoading(true);
        datasource
          .listMetrics(metric?.value ?? '', { ... newPayload })
          .then(
            (metrics) => {
              const foundMetric = find(metrics, (metric) => metric.value === query.target);
              setMetric(foundMetric === undefined ? { label: '', value: '' } : foundMetric);
              setPayloadConfig(foundMetric?.payloads ?? []);
              setMetricOptions(metrics);
            },
            (response) => {
              setMetric({ label: '', value: '' });
              setMetricOptions([]);
              throw new Error(response.statusText);
            }
          )
          .finally(() => {
            setIsMetricOptionsLoading(false);
          });
      }
      return newPayload;
    });
  };
  return (
    <>
      <EditorFieldGroup>
        <EditorField label="Metric">
          <Select
            isLoading={isMetricOptionsLoading}
            options={metricOptions}
            placeholder="Select metric"
            allowCustomValue
            value={metric}
            onOpenMenu={() => {
              loadMetricOptions.length === 0 && loadMetricOptions()
            }}
            onChange={(v) => {
              const findOpts = metricOptions.find((item) => item.value === v.value);
              setPayloadConfig(findOpts?.payloads ?? []);
              setMetric(v);
            }}
          />
        </EditorField>
      </EditorFieldGroup>
      {payloadConfig && payloadConfig.length > 0 && (
        <EditorFieldGroup>
          <EditorField label="Payload" style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexFlow: 'row wrap', gap: 16, width: '100%' }}>
              {payloadConfig.map((opt) => {
                switch (opt.type) {
                  case 'select':
                  case 'multi-select':
                    return (
                      <InlineField key={opt.name} style={{ display: 'inline-flex' }}>
                        <QueryBuilderPayloadSelect
                          {... props}
                          config={opt}
                          value={payload[opt.name]}
                          isMulti={opt.type === 'multi-select'}
                          onPayloadChange={(v) => {
                            changePayload(opt.name, opt.reloadMetric, v);
                          }}
                        />
                      </InlineField>
                    );
                  case 'textarea':
                    return (
                      <InlineField key={opt.name} style={{ width: '100%', display: 'inline' }}>
                        <div style={{ width: '100%', display: 'flex' }}>
                          <label className="gf-form-label">{opt.label ?? opt.label}</label>
                          <QueryBuilderTextArea
                            config={opt}
                            value={payload[opt.name] as string}
                            onValueChange={(v) => {
                              changePayload(opt.name, opt.reloadMetric, { value: v });
                            }}
                          />
                        </div>
                      </InlineField>
                    );
                  default:
                    return (
                      <InlineField key={opt.name} style={{ display: 'inline-flex' }}>
                        <Input
                          prefix={opt.label}
                          width={opt.width}
                          onBlur={(e) => {
                            changePayload(opt.name, opt.reloadMetric, { value: e.currentTarget.value });
                          }}
                          defaultValue={payload[opt.name] as string}
                          placeholder={opt.placeholder ?? ''}
                        />
                      </InlineField>
                    );
                }
              })}
            </div>
          </EditorField>
        </EditorFieldGroup>
      )}
      {unusedPayload.length > 0 && (<EditorFieldGroup>
        <EditorField label="unused">
          <div style={{ display: 'flex', flexFlow: 'row wrap', gap: 16, width: '100%' }}>{
            unusedPayload.map((item, idx) => {
              return <QueryBuilderTag
                key={`${item.name}-${idx}`}
                name={item.name}
                value={item.value}
                onRemove={() => {
                  changePayload(item.name, false, { value: "" });
                }}/>
            })
          }</div>
        </EditorField>
      </EditorFieldGroup>)}
    </>
  );
};
