import {Button,Input,ThemeProvider,DraggablePanel,Skeleton,Empty,Tag} from '@lobehub/ui';
import {App,ConfigProvider,Table,Menu,Modal,Form,Select,InputNumber,DatePicker,Checkbox,Radio,Steps,Tabs,Collapse,Tooltip,Segmented,Input as AntInput,theme as antdTheme} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import * as react from 'react';
import * as reactDomClient from 'react-dom/client';
import * as antdStyle from 'antd-style';
import * as lucide from 'lucide-react';
import AMapLoader from '@amap/amap-jsapi-loader';
export default {'@lobehub/ui':{Button,Input,ThemeProvider,DraggablePanel,Skeleton,Empty,Tag},antd:{App,ConfigProvider,Table,Menu,Modal,Form,Select,InputNumber,DatePicker,Checkbox,Radio,Steps,Tabs,Collapse,Tooltip,Segmented,Input:AntInput,theme:antdTheme},'antd/locale/zh_CN':zhCN,react,'react-dom/client':reactDomClient,'antd-style':antdStyle,'lucide-react':lucide,'@amap/amap-jsapi-loader':AMapLoader};
