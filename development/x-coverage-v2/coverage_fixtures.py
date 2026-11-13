"""Offline fixtures, never ingested into OSINT or Telegram."""
import asyncio,datetime as dt,hashlib,importlib.metadata,inspect,json,os,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import patch
import worker,prepare

def snapshot():
    words=[{'id':1,'term':'yangın','aliases':'[]','enabled':1},{'id':2,'term':'sporcu','aliases':'[]','enabled':1},{'id':3,'term':'pasif','aliases':'[]','enabled':1}]
    return {'at':worker.stamp(),'revision':5,'tables':{'facebook_keywords':words,'common_keyword_state':[{'id':1,'revision':5}],'common_keyword_groups':[{'id':'events','name':'Olay','kind':'olay','priority':'P2','enabled':True,'position':1}],'common_keyword_members':[{'keyword_id':1,'group_id':'events','provider':'x','enabled':1},{'keyword_id':2,'group_id':'events','provider':'x','enabled':1},{'keyword_id':3,'group_id':'events','provider':'x','enabled':0}],'workspace_settings':[]},'sources':[],'existingX':[]}
def record(text='Ümraniye ilçesinde çıkan yangın itfaiye ekiplerinin müdahalesiyle söndürüldü.',date=None):
    return {'id':'2118111006647840775','url':'https://x.com/fixture/status/2118111006647840775','title':text,'description':text,'fullText':text,'publishedAt':date or worker.stamp(),'collectedAt':worker.stamp(),'platform':'x','reader':'twscrape','author':'fixture','displayName':'Test fixture','sourceName':'Test fixture'}
